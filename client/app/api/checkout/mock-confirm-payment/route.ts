"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { confirmOrderPayment } from "@/lib/payments/confirmOrderPayment";
import { sendOrderDeliveryEmail } from "@/lib/mail/sendOrderDeliveryEmail";

// Endpoint de teste — simula o webhook que a EfiBank mandaria quando o
// pagamento de verdade cai. O cliente só pode "confirmar" o próprio
// pedido, e só se esse pedido específico foi criado no modo mock — um
// pedido que já foi cobrado de verdade (payment_transactions.provider =
// 'efibank') nunca pode ser "confirmado" por aqui, senão dava pra
// desbloquear uma compra sem pagar.
export async function POST(req: Request) {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const { orderId } = await req.json();
    const orderIdNum = Number(orderId);
    if (!orderIdNum) return fail("INVALID_ORDER_ID", 400);

    const db = getDB();
    const ownerCheck = await db.query(
      `SELECT o.id, pt.provider
       FROM orders o
       LEFT JOIN payment_transactions pt ON pt.order_id = o.id
       WHERE o.id = $1 AND o.user_id = $2
       ORDER BY pt.created_at DESC
       LIMIT 1`,
      [orderIdNum, userId]
    );
    if (ownerCheck.rows.length === 0) return fail("ORDER_NOT_FOUND", 404);
    if (ownerCheck.rows[0].provider === "efibank") {
      return fail("MOCK_DISABLED_FOR_REAL_PAYMENT", 403);
    }

    const result = await confirmOrderPayment(orderIdNum);

    if (!result.alreadyProcessed && result.deliveredItems.length > 0 && result.customerEmail) {
      try {
        await sendOrderDeliveryEmail({
          to: result.customerEmail,
          orderId: orderIdNum,
          items: result.deliveredItems,
        });
      } catch (mailError) {
        console.error("Falha ao enviar e-mail de entrega:", mailError);
      }
    }

    return ok({ order: result.order, deliveredItems: result.deliveredItems });
  } catch (error) {
    console.error("Erro ao confirmar pagamento (mock):", error);
    return fail("MOCK_CONFIRM_INTERNAL_ERROR", 500);
  }
}
