import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

type RouteParams = {
  params: Promise<{ id: string; target: string }>;
};

export async function GET(req: Request, { params }: RouteParams) {
  const { id, target } = await params;
  
  try {
    const db = getDB();
    const table = target === "variation" ? "product_variations" : "products";
    const keyColumn = target === "variation" ? "variation_id" : "product_id";

    const infoResult = await db.query(
      `SELECT stock_type, stock_content, stock_count, is_unlimited 
       FROM ${table} 
       WHERE id = $1`,
      [id]
    );

    if (infoResult.rows.length === 0) {
      return fail("TARGET_NOT_FOUND", 404);
    }

    const info = infoResult.rows[0];
    let keys = [];
    if (info.stock_type === "key") {
      const keysResult = await db.query(
        `SELECT id, key_content 
         FROM stock_keys 
         WHERE ${keyColumn} = $1 AND is_sold = false
         ORDER BY id ASC`,
        [id]
      );
      keys = keysResult.rows;
    }

    return ok({
      stock_type: info.stock_type,
      stock_content: info.stock_content || "",
      stock_count: Number(info.stock_count) || 0,
      is_unlimited: Boolean(info.is_unlimited),
      keys: keys.map(k => k.key_content).join("\n") 
    });

  } catch (error) {
    console.error("GET_STOCK_ERROR:", error);
    return fail("ERROR_LOADING_STOCK", 500);
  }
}