import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

type RouteParams = {
  params: Promise<{ id: string, target: string }>;
};


export async function DELETE(req: Request, { params }: RouteParams) {
  var { id, target } = await params;
  try {
    const db = await getDB();
    var keyColumn = target === "variation" ? "variation_id" : "product_id";

    await db.query(
      `DELETE FROM stock_keys WHERE ${keyColumn} = $1 AND is_sold = false`,
      [id]
    );

    return ok("SUCESS",200);
  } catch (error) {
    return fail("ERROR_CLEAR_STOCK", 500);
  }
}