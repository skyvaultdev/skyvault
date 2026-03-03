import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

type RouteParams = {
  params: Promise<{ id: string, target: string }>;
};

export async function GET(req: Request, { params }: RouteParams) {
  const { id, target } = await params;
  try {
    const { target, id } = params;
    const db = await getDB();
    const table = target === "variation" ? "product_variations" : "products";
    const keyColumn = target === "variation" ? "variation_id" : "product_id";

    const info = await db.query(
      `SELECT stock_type, stock_file_path FROM ${table} WHERE id = $1`,
      [id]
    );

    const keys = await db.query(
      `SELECT id, key_content FROM stock_keys 
       WHERE ${keyColumn} = $1 AND is_sold = false`,
      [id]
    );

    return ok({
      type: info.rows[0]?.stock_type || "infinite",
      filePath: info.rows[0]?.stock_file_path,
      keys: keys.rows
    });
  } catch (error) {
    return fail("ERROR_LOADING_STOCK", 500);
  }
}