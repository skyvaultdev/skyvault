import { cookies } from "next/headers";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { verifyJWT } from "@/lib/jwt/init";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return fail("UNAUTHORIZED", 401);

    const payload = await verifyJWT(token);
    if (!payload?.email) return fail("UNAUTHORIZED", 401);

    var { productId, variationId, orderId } = await req.json();
    const db = await getDB();

    var isVariation = !!variationId;
    var targetId = isVariation ? Number(variationId) : Number(productId);
    var orderIdNum = Number(orderId);
    if (!targetId || !orderIdNum) return fail("INVALID_DATA", 400);
    var table = isVariation ? "product_variations" : "products";
    var keyColumn = isVariation ? "variation_id" : "product_id";

    const { rows: userRows } = await db.query(`SELECT id FROM users WHERE email = $1`, [payload.email]);
    if (userRows.length === 0) return fail("UNAUTHORIZED", 401);
    const userId = userRows[0].id;

    const orderCheck = await db.query(
      `SELECT o.id FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1 AND o.user_id = $2
         AND oi.product_id IS NOT DISTINCT FROM $3
         AND oi.variation_id IS NOT DISTINCT FROM $4`,
      [orderIdNum, userId, isVariation ? null : targetId, isVariation ? targetId : null]
    );
    if (orderCheck.rows.length === 0) return fail("ORDER_NOT_FOUND", 403);

    const info = await db.query(
      `SELECT stock_type, stock_content FROM ${table} WHERE id = $1`,
      [targetId]
    );

    if (info.rows.length === 0) return fail("Item não encontrado.");
    var { stock_type, stock_content } = info.rows[0];

    if (stock_type === "key") {
      const res = await db.query(
        `UPDATE stock_keys 
         SET is_sold = true, order_id = $1, sold_at = NOW()
         WHERE id = (
           SELECT id FROM stock_keys 
           WHERE ${keyColumn} = $2 AND is_sold = false 
           LIMIT 1 
           FOR UPDATE SKIP LOCKED
         )
         RETURNING key_content`,
        [orderIdNum, targetId]
      );

      if (res.rows.length === 0) return fail("Estoque de chaves esgotado.");
      return ok({ content: res.rows[0].key_content, type: "key" });
    } 
    
    if (stock_type === "file") {
      return ok({ content: `/api/files/products/uploads/${stock_content}`, type: "file" });
    }

    return ok({ content: "Entrega Automática Ativada", type: "infinite" });

  } catch (error) {
    return fail("STOCK_INTERNAL_ERROR", 500);
  }
}