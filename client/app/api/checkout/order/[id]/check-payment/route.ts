"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { requireCustomer } from "@/lib/auth/customer";
import { getMercadoPagoPaymentStatus } from "@/lib/payments/mercadoPagoProvider";
import { confirmOrderPayment } from "@/lib/payments/confirmOrderPayment";
import { sendOrderDeliveryEmail } from "@/lib/mail/sendOrderDeliveryEmail";
import { logDeliveryFailure } from "@/lib/payments/deliveryFailures";
import { rateLimit } from "@/lib/security/rateLimit";

type Params = { params: Promise<{ id: string }> };

// A tela de "aguardando pagamento" (Pix/boleto) chama isso em vez de só
// ler o status já salvo — se depender só do webhook do Mercado Pago pra
// marcar como pago, qualquer falha na entrega dele (túnel de dev fora do
// ar, assinatura rejeitada, etc.) deixa o pedido pago de verdade mas
// travado como pendente pra sempre, sem digital entregue nem físico
// despachado. Aqui o PRÓPRIO cliente, só de ficar olhando a tela,
// pergunta direto pro Mercado Pago "esse pagamento já caiu?" — mesma
// checagem que o webhook faria, só que disparada pelo polling do
// navegador em vez de depender do Mercado Pago conseguir nos chamar de
// volta.
export async function POST(_req: Request, { params }: Params) {
  const { userId, denied } = await requireCustomer();
  if (denied) return denied;

  const { id } = await params;
  const orderId = Number(id);
  if (!orderId) return NextResponse.json({ error: "INVALID_ORDER_ID" }, { status: 400 });

  // A tela de espera chama isso sozinha a cada 4s — limite generoso o
  // suficiente pra cobrir esse polling normal (até uns 20min de espera
  // contínua) sem travar o cliente legítimo, só contendo abuso de verdade.
  if (!rateLimit(`check-payment:${userId}:${orderId}`, 100, 5 * 60_000)) {
    return NextResponse.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 });
  }

  const db = getDB();
  const orderRes = await db.query(`SELECT id, status FROM orders WHERE id = $1 AND user_id = $2`, [orderId, userId]);
  const order = orderRes.rows[0];
  if (!order) return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

  if (order.status === "paid" || order.status === "delivered") {
    return NextResponse.json({ data: { status: order.status } });
  }
  if (order.status !== "pending_payment") {
    return NextResponse.json({ data: { status: order.status } });
  }

  // Checa TODAS as transações pendentes do pedido, não só a mais recente —
  // se o cliente gerou Pix mais de uma vez pro mesmo pedido (reload,
  // duplo clique, retomar checkout) e pagou uma cobrança mais antiga, só
  // olhar a última deixaria o pagamento pago de verdade preso pra sempre
  // (a checagem sempre perguntava pro Mercado Pago sobre o txid errado).
  const txRes = await db.query(
    `SELECT provider_txid, method, status, created_at FROM payment_transactions
     WHERE order_id = $1 AND provider = 'mercadopago' AND status != 'paid' AND provider_txid IS NOT NULL
     ORDER BY created_at DESC`,
    [orderId]
  );
  console.log(`[check-payment] pedido #${orderId}: ${txRes.rows.length} transação(ões) pendente(s) encontrada(s)`, txRes.rows);
  if (txRes.rows.length === 0) return NextResponse.json({ data: { status: order.status } });

  let paidTxid: string | null = null;
  try {
    for (const tx of txRes.rows) {
      const mpStatus = await getMercadoPagoPaymentStatus(tx.provider_txid);
      const rawStatus = (mpStatus.raw as { status?: string } | null)?.status;
      console.log(`[check-payment] pedido #${orderId}, txid ${tx.provider_txid}: Mercado Pago respondeu status =`, rawStatus, "paid =", mpStatus.paid);
      if (mpStatus.paid) {
        paidTxid = tx.provider_txid;
        break;
      }
    }
  } catch (mpError) {
    // Falha ao CONSULTAR o Mercado Pago (rede, credencial, etc.) — não
    // significa que o pagamento falhou, só que não deu pra confirmar agora.
    // Transitório: o próximo poll (4s depois) tenta de novo sozinho.
    console.error(`[check-payment] pedido #${orderId}: erro ao consultar Mercado Pago —`, mpError);
    return NextResponse.json({ data: { status: order.status } });
  }

  if (!paidTxid) {
    return NextResponse.json({ data: { status: order.status } });
  }

  try {
    const result = await confirmOrderPayment(orderId);
    console.log(`[check-payment] pedido #${orderId}: confirmOrderPayment concluído, status final =`, result.order.status, "alreadyProcessed =", result.alreadyProcessed);
    if (result.stockShortages.length > 0) {
      console.error(`[check-payment] pedido #${orderId}: ATENÇÃO — pagamento confirmado com estoque insuficiente:`, result.stockShortages);
    }
    if (!result.alreadyProcessed && result.deliveredItems.length > 0 && result.customerEmail) {
      try {
        await sendOrderDeliveryEmail({ to: result.customerEmail, orderId, orderNumber: result.order?.order_number, items: result.deliveredItems });
      } catch (mailError) {
        console.error("Falha ao enviar e-mail de entrega:", mailError);
      }
    }

    return NextResponse.json({ data: { status: result.order.status } });
  } catch (deliveryError) {
    // Diferente do catch acima: aqui o Mercado Pago JÁ confirmou o
    // pagamento (paidTxid existe) — é confirmOrderPayment que falhou depois
    // disso. Isso não pode voltar como "ainda pendente" silenciosamente
    // (o cliente ficaria preso pra sempre na tela de espera sem saber que
    // algo deu errado do nosso lado) — registra pra reconciliação manual e
    // sinaliza deliveryFailed pro front parar de tratar isso como "só
    // aguardando" e mostrar um aviso claro.
    await logDeliveryFailure(orderId, "check_payment", deliveryError);
    return NextResponse.json({ data: { status: order.status, deliveryFailed: true } });
  }
}
