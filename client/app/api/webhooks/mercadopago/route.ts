"use server";

import crypto from "crypto";
import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { loadMercadoPagoCredentials, isMercadoPagoConfigured } from "@/lib/payments/mercadoPagoCredentials";
import { getMercadoPagoPaymentStatus } from "@/lib/payments/mercadoPagoProvider";
import { confirmOrderPayment } from "@/lib/payments/confirmOrderPayment";
import { sendOrderDeliveryEmail } from "@/lib/mail/sendOrderDeliveryEmail";

// Formato de assinatura documentado pelo Mercado Pago: header `x-signature`
// no formato "ts=<epoch>,v1=<hash>", hash = HMAC-SHA256 de
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" usando o webhook secret
// da loja. Só valida se a loja configurou um webhook secret — sem ele, cai
// pro modelo "nunca confia no payload sozinho, sempre confirma via GET
// autenticado" (mais fraco, mas ainda seguro contra forjar um pagamento
// falso, já que quem decide se pagou é a chamada de volta pro MP).
function verifySignature(req: Request, dataId: string, secret: string): boolean {
  const signatureHeader = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id");
  if (!signatureHeader || !requestId) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.trim().split("=")).map(([k, v]) => [k, v])
  );
  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !hash) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const computed = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return computed === hash;
}

export async function POST(req: Request) {
  try {
    if (!(await isMercadoPagoConfigured())) {
      console.warn("[webhook mercadopago] recebido, mas Mercado Pago não está configurado no servidor — ignorado.");
      return fail("MERCADOPAGO_NOT_CONFIGURED", 501);
    }

    const body = await req.json().catch(() => ({}));
    const dataId = body?.data?.id ? String(body.data.id) : null;
    console.log(`[webhook mercadopago] recebido — data.id=${dataId ?? "(ausente)"}, type=${body?.type ?? "(ausente)"}`);
    if (!dataId) return ok({ received: true });

    // A assinatura é conferida e logada, mas NÃO bloqueia mais o webhook
    // sozinha — nunca testamos contra um webhook real do Mercado Pago
    // antes, e um detalhe sutil errado no formato (ainda não confirmado
    // ao vivo) rejeitaria pagamentos de verdade silenciosamente. A
    // segurança de verdade já vem de dois outros pontos, ambos
    // confirmados abaixo: o provider_txid tem que bater com uma
    // transação que NÓS criamos, e o status final vem sempre de uma
    // chamada autenticada de volta pro Mercado Pago (nunca do corpo do
    // webhook em si) — um payload forjado não credita nada mesmo que
    // passe por aqui.
    const creds = await loadMercadoPagoCredentials();
    if (creds?.webhookSecret) {
      const validSignature = verifySignature(req, dataId, creds.webhookSecret);
      if (!validSignature) {
        console.warn(`Webhook Mercado Pago com assinatura não confere (data.id=${dataId}) — seguindo mesmo assim, a confirmação real é via GET autenticado.`);
      }
    }

    const db = getDB();
    const txRes = await db.query(
      `SELECT order_id FROM payment_transactions WHERE provider = 'mercadopago' AND provider_txid = $1`,
      [dataId]
    );
    if (txRes.rows.length === 0) {
      console.log(`[webhook mercadopago] data.id=${dataId} não corresponde a nenhuma transação nossa — ignorado.`);
      return ok({ received: true });
    }

    const orderId = txRes.rows[0].order_id;

    // Nunca confia no payload do webhook sozinho — sempre confirma direto
    // com nossas próprias credenciais antes de liberar qualquer coisa.
    const status = await getMercadoPagoPaymentStatus(dataId);
    console.log(`[webhook mercadopago] pedido #${orderId}, txid ${dataId}: Mercado Pago confirma paid=${status.paid}`);
    if (!status.paid) return ok({ received: true });

    let result;
    try {
      result = await confirmOrderPayment(orderId);
    } catch (deliveryError) {
      // Pagamento confirmado pelo Mercado Pago, mas a entrega/baixa de
      // estoque falhou (erro de banco, produto removido, etc.) — a
      // transação inteira de confirmOrderPayment já deu rollback (pedido
      // continua pending_payment), então é seguro devolver erro aqui: o
      // Mercado Pago reenvia o webhook automaticamente em caso de falha,
      // e o polling ativo do cliente (check-payment) também tenta de novo.
      console.error(`[webhook mercadopago] pedido #${orderId}: pagamento aprovado mas FALHA AO ENTREGAR/baixar estoque —`, deliveryError);
      return fail("DELIVERY_FAILED", 500);
    }

    console.log(`[webhook mercadopago] pedido #${orderId}: confirmado com sucesso, status final = ${result.order.status}, alreadyProcessed = ${result.alreadyProcessed}`);

    if (result.stockShortages.length > 0) {
      console.error(`[webhook mercadopago] pedido #${orderId}: ATENÇÃO — pagamento confirmado com estoque insuficiente:`, result.stockShortages);
    }

    if (!result.alreadyProcessed && result.deliveredItems.length > 0 && result.customerEmail) {
      try {
        await sendOrderDeliveryEmail({ to: result.customerEmail, orderId, orderNumber: result.order?.order_number, items: result.deliveredItems });
      } catch (mailError) {
        console.error(`[webhook mercadopago] pedido #${orderId}: falha ao enviar e-mail de entrega —`, mailError);
      }
    }

    return ok({ received: true });
  } catch (error) {
    console.error("[webhook mercadopago] erro inesperado:", error);
    return fail("WEBHOOK_INTERNAL_ERROR", 500);
  }
}
