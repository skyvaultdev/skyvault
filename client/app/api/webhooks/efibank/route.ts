"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { isEfibankConfigured } from "@/lib/payments/efibankCredentials";
import { getEfibankChargeStatus } from "@/lib/payments/efibankProvider";
import { confirmOrderPayment } from "@/lib/payments/confirmOrderPayment";
import { sendOrderDeliveryEmail } from "@/lib/mail/sendOrderDeliveryEmail";

// A EfiBank não assina o payload do webhook (sem HMAC/secret pra
// verificar) — o modelo de segurança recomendado por eles é tratar a
// notificação só como um "avise", e confirmar o status de verdade com uma
// chamada autenticada de volta pra API deles (com nosso próprio
// certificado mTLS), nunca confiando no corpo do POST recebido.
export async function POST(req: Request) {
  try {
    if (!(await isEfibankConfigured())) {
      return fail("EFIBANK_NOT_CONFIGURED", 501);
    }

    const body = await req.json().catch(() => ({}));
    const txids: string[] = Array.isArray(body?.pix)
      ? body.pix.map((p: any) => p?.txid).filter(Boolean)
      : [];

    // Sempre responde 200 rápido, mesmo sem txid reconhecido — é o que a
    // EfiBank espera pra não ficar reenviando o mesmo evento.
    if (txids.length === 0) return ok({ received: true });

    const db = getDB();

    for (const txid of txids) {
      const txRes = await db.query(
        `SELECT order_id FROM payment_transactions WHERE provider = 'efibank' AND provider_txid = $1`,
        [txid]
      );
      if (txRes.rows.length === 0) continue;

      const status = await getEfibankChargeStatus(txid);
      if (!status.paid) continue;

      const orderId = txRes.rows[0].order_id;
      const result = await confirmOrderPayment(orderId);

      if (!result.alreadyProcessed && result.deliveredItems.length > 0 && result.customerEmail) {
        try {
          await sendOrderDeliveryEmail({ to: result.customerEmail, orderId, items: result.deliveredItems });
        } catch (mailError) {
          console.error("Falha ao enviar e-mail de entrega:", mailError);
        }
      }
    }

    return ok({ received: true });
  } catch (error) {
    console.error("Erro no webhook EfiBank:", error);
    return fail("WEBHOOK_INTERNAL_ERROR", 500);
  }
}
