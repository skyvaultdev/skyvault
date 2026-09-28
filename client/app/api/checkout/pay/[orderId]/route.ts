"use server";

import crypto from "crypto";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { getPaymentProvider } from "@/lib/payments";
import type { PaymentMethod } from "@/lib/payments/PaymentProvider";
import { confirmOrderPayment } from "@/lib/payments/confirmOrderPayment";
import { sendOrderDeliveryEmail } from "@/lib/mail/sendOrderDeliveryEmail";
import { logDeliveryFailure } from "@/lib/payments/deliveryFailures";
import { rateLimit } from "@/lib/security/rateLimit";

type Params = { params: Promise<{ orderId: string }> };

const VALID_METHODS: PaymentMethod[] = ["pix", "credit_card", "debit_card", "boleto"];

export async function POST(req: Request, { params }: Params) {
  try {
    const { email, userId, denied } = await requireCustomer();
    if (denied) return denied;

    // Mesmo padrão de rate limit já usado em auth/email e dev/auth/login —
    // limita tentativas de cobrança por cliente, não só por pedido, pra
    // cobrir tanto "duplo clique insistente no mesmo pedido" quanto "script
    // tentando cobrar vários pedidos em sequência".
    if (!rateLimit(`checkout-pay:${userId}`, 10, 5 * 60_000)) {
      return fail("TOO_MANY_REQUESTS", 429);
    }

    const { orderId: orderIdParam } = await params;
    const orderId = Number(orderIdParam);
    if (!orderId) return fail("INVALID_ORDER_ID", 400);

    const db = getDB();
    const orderRes = await db.query(`SELECT * FROM orders WHERE id = $1 AND user_id = $2`, [orderId, userId]);
    if (orderRes.rows.length === 0) return fail("ORDER_NOT_FOUND", 404);
    const order = orderRes.rows[0];

    if (order.status !== "pending_payment") {
      return fail("ORDER_NOT_PAYABLE", 409);
    }

    const body = await req.json();
    const method = body.method as PaymentMethod;
    if (!VALID_METHODS.includes(method)) return fail("INVALID_METHOD", 400);

    // Idempotency key determinística (não mais crypto.randomUUID()) — uma
    // por combinação de pedido+método+tentativa. "Tentativa" é contada só
    // por transações FALHADAS anteriores, então: (a) duas requisições pro
    // mesmo pedido+método sem nenhuma falha ainda geram a MESMA chave — se
    // isso acontecer por duplo clique ou requests quase simultâneas, a
    // SEGUNDA bate no índice único de payment_transactions.idempotency_key
    // (já existe no banco) e é bloqueada antes de chamar o provider de
    // pagamento de verdade; (b) depois de uma falha real (cartão recusado,
    // erro do provider), uma nova tentativa legítima do cliente ganha uma
    // chave diferente e segue normalmente.
    const failedAttemptsRes = await db.query(
      `SELECT COUNT(*) AS n FROM payment_transactions WHERE order_id = $1 AND method = $2 AND status = 'failed'`,
      [orderId, method]
    );
    const attemptSuffix = Number(failedAttemptsRes.rows[0]?.n ?? 0);
    const idempotencyKey = crypto.createHash("sha256").update(`${orderId}:${method}:${attemptSuffix}`).digest("hex");
    const paymentProvider = await getPaymentProvider();

    try {
      await db.query(
        `INSERT INTO payment_transactions
           (order_id, provider, provider_txid, method, status, amount, idempotency_key)
         VALUES ($1, $2, NULL, $3, 'pending', $4, $5)`,
        [orderId, paymentProvider.name, method, order.total, idempotencyKey]
      );
    } catch (insertError) {
      if ((insertError as { code?: string })?.code === "23505") {
        // Unique constraint em idempotency_key — já existe uma cobrança
        // pendente/aprovada em andamento pra esse pedido+método exato.
        // Nunca chama o provider de pagamento de novo nesse caso.
        console.warn(`[checkout/pay] pedido #${orderId}: tentativa de pagamento duplicada bloqueada (método ${method}).`);
        return fail("DUPLICATE_PAYMENT_ATTEMPT", 409);
      }
      throw insertError;
    }

    let charge;
    try {
      charge = await paymentProvider.createCharge({
        orderId,
        amount: Number(order.total),
        method,
        idempotencyKey,
        customerEmail: email!,
        brickFormData: body.formData ?? undefined,
      });
    } catch (chargeError) {
      // Erro de verdade na chamada ao Mercado Pago (não uma recusa de
      // cartão normal, que volta como status "rejected" e não cai aqui) —
      // atualiza a linha placeholder já inserida acima pra "failed" (não
      // insere uma nova) pra ficar visível no admin em vez de só logar no
      // console e sumir sem rastro. Isso também libera uma nova tentativa
      // com uma idempotency key diferente da próxima vez.
      console.error(`Erro ao criar cobrança (pedido #${orderId}, ${method}):`, chargeError);
      await db.query(
        `UPDATE payment_transactions SET status = 'failed', raw_payload = $1, updated_at = NOW() WHERE idempotency_key = $2`,
        [
          JSON.stringify({ error: chargeError instanceof Error ? chargeError.message : String(chargeError) }),
          idempotencyKey,
        ]
      );
      return fail("PAYMENT_PROVIDER_ERROR", 502);
    }

    console.log(`[checkout/pay] pedido #${orderId}: cobrança criada via ${paymentProvider.name}, método ${method}, txid ${charge.providerTxid}, status ${charge.status}`);

    await db.query(
      `UPDATE payment_transactions
       SET provider_txid = $1, status = $2, raw_payload = $3, updated_at = NOW()
       WHERE idempotency_key = $4`,
      [
        charge.providerTxid,
        charge.status === "paid" ? "paid" : charge.status === "failed" ? "failed" : "pending",
        JSON.stringify(charge.raw), idempotencyKey,
      ]
    );

    // Cartão costuma aprovar (ou recusar) na hora — não precisa esperar o
    // webhook pra liberar a entrega. Pix/boleto ficam pendentes até o
    // webhook (ou o mock-confirm-payment em modo de teste) confirmar.
    let deliveredItems: unknown[] = [];
    let deliveryFailed = false;
    let orderTotal: number | null = null;
    let orderPaidAt: string | null = null;
    if (charge.status === "paid") {
      try {
        const result = await confirmOrderPayment(orderId);
        deliveredItems = result.deliveredItems;
        orderTotal = result.order?.total ?? null;
        orderPaidAt = result.order?.paid_at ?? null;
        if (result.stockShortages.length > 0) {
          console.error(`[checkout/pay] pedido #${orderId}: ATENÇÃO — pagamento confirmado com estoque insuficiente:`, result.stockShortages);
        }
        if (!result.alreadyProcessed && result.deliveredItems.length > 0 && result.customerEmail) {
          try {
            await sendOrderDeliveryEmail({ to: result.customerEmail, orderId, orderNumber: result.order?.order_number, items: result.deliveredItems });
          } catch (mailError) {
            console.error(`[checkout/pay] pedido #${orderId}: falha ao enviar e-mail de entrega —`, mailError);
          }
        }
      } catch (deliveryError) {
        // O cartão JÁ foi cobrado com sucesso nesse ponto — confirmOrderPayment
        // deu rollback (pedido continua pending_payment), mas devolver um erro
        // genérico de pagamento aqui enganaria o cliente dizendo que a cobrança
        // falhou quando na verdade ela passou. Registra em delivery_failures
        // (pra reconciliação manual — nunca pode só sumir num log) e sinaliza
        // deliveryFailed pro front avisar o cliente em vez de fingir sucesso
        // total. O webhook (ou o polling da tela de espera) tentam de novo.
        await logDeliveryFailure(orderId, "checkout_pay", deliveryError);
        deliveryFailed = true;
      }
    }

    return ok({
      status: charge.status,
      failureReason: charge.failureReason,
      pixCopyPaste: charge.pixCopyPaste,
      pixQrCodeBase64: charge.pixQrCodeBase64,
      boletoUrl: charge.boletoUrl,
      boletoBarcode: charge.boletoBarcode,
      deliveredItems,
      deliveryFailed,
      orderTotal,
      orderPaidAt,
    });
  } catch (error) {
    console.error("Erro ao processar pagamento:", error);
    return fail("PAYMENT_INTERNAL_ERROR", 500);
  }
}
