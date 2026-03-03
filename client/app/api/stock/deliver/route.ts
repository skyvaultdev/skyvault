import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

export async function POST(req: Request) {
  try {
    const { productId, variationId, orderId } = await req.json();
    const db = await getDB();

    const isVariation = !!variationId;
    const targetId = isVariation ? variationId : productId;
    const table = isVariation ? "product_variations" : "products";
    const keyColumn = isVariation ? "variation_id" : "product_id";

    const info = await db.query(
      `SELECT stock_type, stock_file_path FROM ${table} WHERE id = $1`,
      [targetId]
    );

    if (info.rows.length === 0) return fail("Item não encontrado.");
    const { stock_type, stock_file_path } = info.rows[0];

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
        [orderId, targetId]
      );

      if (res.rows.length === 0) return fail("Estoque de chaves esgotado.");
      return ok({ content: res.rows[0].key_content, type: "key" });
    } 
    
    if (stock_type === "file") {
      return ok({ content: stock_file_path, type: "file" });
    }

    return ok({ content: "Entrega Automática Ativada", type: "infinite" });

  } catch (error) {
    return fail("STOCK_INTERNAL_ERROR", 500);
  }
}