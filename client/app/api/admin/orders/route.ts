"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

export async function GET(req: Request) {
  try {
    const { denied } = await requirePermission("orders.read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim();
    const q = searchParams.get("q")?.trim();

    const db = getDB();
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (status) {
      params.push(status);
      where.push(`o.status = $${params.length}`);
    }

    if (q) {
      if (/^\d+$/.test(q)) {
        params.push(Number(q));
        where.push(`o.id = $${params.length}`);
      } else {
        params.push(`%${q}%`);
        where.push(`u.email ILIKE $${params.length}`);
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const result = await db.query(
      `SELECT
         o.id, o.status, o.total, o.subtotal, o.shipping_fee, o.platform_fee,
         o.created_at, o.paid_at, u.email AS customer_email,
         (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
         (SELECT bool_or(oi.product_type = 'physical') FROM order_items oi WHERE oi.order_id = o.id) AS has_physical,
         s.status AS shipment_status, s.tracking_code
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN shipments s ON s.order_id = o.id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT 100`,
      params
    );

    return ok(result.rows);
  } catch (error) {
    console.error("Erro ao listar pedidos:", error);
    return fail("ORDERS_LIST_ERROR", 500);
  }
}
