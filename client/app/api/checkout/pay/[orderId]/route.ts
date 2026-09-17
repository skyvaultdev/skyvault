"use server";

import crypto from "crypto";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { getPaymentProvider } from "@/lib/payments";
import type { PaymentMethod } from "@/lib/payments/PaymentProvider";
import { confirmOrderPayment } from "@/lib/payments/confirmOrderPayment";
import { sendOrderDeliveryEmail } from "@/lib/mail/sendOrderDeliveryEmail";

type Params = { params: Promise<{ orderId: string }> };

const VALID_METHODS: PaymentMethod[] = ["pix", "credit_card", "debit_card", "boleto"];

export async function POST(req: Request, { params }: Params) {
  try {
    const { email, userId, denied } = await requireCustomer();
    if (denied) return denied;

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

    const idempotencyKey = crypto.randomUUID();
    const paymentProvider = await getPaymentProvider();

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
      // registra a tentativa como falha pra ficar visível no admin em vez
      // de só logar no console e sumir sem rastro.
      console.error(`Erro ao criar cobrança (pedido #${orderId}, ${method}):`, chargeError);
      await db.query(
        `INSERT INTO payment_transactions
           (order_id, provider, provider_txid, method, status, amount, idempotency_key, raw_payload)
         VALUES ($1, $2, NULL, $3, 'failed', $4, $5, $6)`,
        [
          orderId, paymentProvider.name, method, order.total, idempotencyKey,
          JSON.stringify({ error: chargeError instanceof Error ? chargeError.message : String(chargeError) }),
        ]
      );
      return fail("PAYMENT_PROVIDER_ERROR", 502);
    }

    console.log(`[checkout/pay] pedido #${orderId}: cobrança criada via ${paymentProvider.name}, método ${method}, txid ${charge.providerTxid}, status ${charge.status}`);

    await db.query(
      `INSERT INTO payment_transactions
         (order_id, provider, provider_txid, method, status, amount, idempotency_key, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        orderId, paymentProvider.name, charge.providerTxid, method,
        charge.status === "paid" ? "paid" : charge.status === "failed" ? "failed" : "pending",
        order.total, idempotencyKey, JSON.stringify(charge.raw),
      ]
    );

    // Cartão costuma aprovar (ou recusar) na hora — não precisa esperar o
    // webhook pra liberar a entrega. Pix/boleto ficam pendentes até o
    // webhook (ou o mock-confirm-payment em modo de teste) confirmar.
    let deliveredItems: unknown[] = [];
    if (charge.status === "paid") {
      try {
        const result = await confirmOrderPayment(orderId);
        deliveredItems = result.deliveredItems;
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
        // falhou quando na verdade ela passou. Loga claramente e responde como
        // pago mesmo assim: o webhook (ou o polling da tela de espera) vai
        // reconfirmar e completar a entrega/baixa de estoque em seguida.
        console.error(`[checkout/pay] pedido #${orderId}: pagamento aprovado mas FALHA AO ENTREGAR/baixar estoque —`, deliveryError);
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
    });
  } catch (error) {
    console.error("Erro ao processar pagamento:", error);
    return fail("PAYMENT_INTERNAL_ERROR", 500);
  }
}
