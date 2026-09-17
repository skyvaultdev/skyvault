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
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 20));

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
        const orderNumberIdx = params.length;
        params.push(`%${q}%`);
        const emailIdx = params.length;
        where.push(`(o.order_number ILIKE $${orderNumberIdx} OR u.email ILIKE $${emailIdx})`);
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const countRes = await db.query(
      `SELECT COUNT(*) AS total FROM orders o LEFT JOIN users u ON u.id = o.user_id ${whereClause}`,
      params
    );

    params.push(pageSize);
    const limitIdx = params.length;
    params.push((page - 1) * pageSize);
    const offsetIdx = params.length;

    const result = await db.query(
      `SELECT
         o.id, o.order_number, o.status, o.total, o.subtotal, o.shipping_fee,
         o.created_at, o.paid_at, u.email AS customer_email,
         (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
         (SELECT bool_or(oi.product_type = 'physical') FROM order_items oi WHERE oi.order_id = o.id) AS has_physical,
         (SELECT (SELECT url FROM product_images pi WHERE pi.product_id = oi2.product_id ORDER BY pi.position ASC LIMIT 1)
            FROM order_items oi2 WHERE oi2.order_id = o.id ORDER BY oi2.id ASC LIMIT 1) AS thumbnail_url,
         s.status AS shipment_status, s.tracking_code
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN shipments s ON s.order_id = o.id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    return ok({
      items: result.rows,
      total: Number(countRes.rows[0]?.total ?? 0),
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Erro ao listar pedidos:", error);
    return fail("ORDERS_LIST_ERROR", 500);
  }
}
