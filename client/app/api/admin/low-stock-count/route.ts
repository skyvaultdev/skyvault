"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { requirePermission } from "@/lib/auth/guard";

const LOW_STOCK_THRESHOLD = 5;

// Conta produtos/variações ativos, não-ilimitados, com pouco estoque —
// nada disso existia antes: estoque zerando só era descoberto quando um
// cliente já tinha tentado comprar e esbarrado em OUT_OF_STOCK.
export async function GET() {
  try {
    const { denied } = await requirePermission("products.write");
    if (denied) return denied;

    const db = getDB();
    const result = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM products
          WHERE active = true AND is_unlimited = false AND stock_count <= $1
            AND id NOT IN (SELECT DISTINCT product_id FROM product_variations)) +
         (SELECT COUNT(*) FROM product_variations v
          JOIN products p ON p.id = v.product_id
          WHERE p.active = true AND v.is_unlimited = false AND v.stock_count <= $1) AS count`,
      [LOW_STOCK_THRESHOLD]
    );

    return ok({ count: Number(result.rows[0]?.count ?? 0), threshold: LOW_STOCK_THRESHOLD });
  } catch (error) {
    console.error("Erro ao calcular estoque baixo:", error);
    return fail("INTERNAL_ERROR", 500);
  }
}
