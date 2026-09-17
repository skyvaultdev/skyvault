"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";

// Histórico de pedidos DO PRÓPRIO cliente logado — equivalente ao
// /api/admin/orders, mas sem permissão de staff nenhuma, escopado por
// user_id. Detalhe de cada pedido (itens entregues, timeline de envio) fica
// em /api/checkout/order/[id], que já era usado pra tela pós-pagamento.
export async function GET(req: Request) {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 10));

    const db = getDB();
    const countRes = await db.query(
      `SELECT COUNT(*) AS total FROM orders WHERE user_id = $1 AND status != 'pending_payment'`,
      [userId]
    );

    const result = await db.query(
      `SELECT
         o.id, o.order_number, o.status, o.total, o.created_at, o.paid_at,
         (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
         (SELECT bool_or(oi.product_type = 'physical') FROM order_items oi WHERE oi.order_id = o.id) AS has_physical,
         (SELECT (SELECT url FROM product_images pi WHERE pi.product_id = oi2.product_id ORDER BY pi.position ASC LIMIT 1)
            FROM order_items oi2 WHERE oi2.order_id = o.id ORDER BY oi2.id ASC LIMIT 1) AS thumbnail_url,
         s.status AS shipment_status, s.tracking_code
       FROM orders o
       LEFT JOIN shipments s ON s.order_id = o.id
       WHERE o.user_id = $1 AND o.status != 'pending_payment'
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, (page - 1) * pageSize]
    );

    return ok({
      items: result.rows,
      total: Number(countRes.rows[0]?.total ?? 0),
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Erro ao listar pedidos do cliente:", error);
    return fail("ORDERS_LIST_ERROR", 500);
  }
}
