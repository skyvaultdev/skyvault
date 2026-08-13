"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { denied } = await requirePermission("products.write");
    if (denied) return denied;

    var { id } = await params;
    if (!/^\d+$/.test(id)) return fail("INVALID_ID", 400);

    const db = getDB();
    const result = await db.query("DELETE FROM products WHERE id = $1 RETURNING id", [Number(id)]);
    if (result.rows.length === 0) return fail("NOT_FOUND", 404);
    return ok({ id: result.rows[0].id });

    const vars = await db.query("SELECT id FROM variations WHERE product_id = $1", [Number(id)]);
    if (vars.rows.length > 0) {
      await db.query("DELETE FROM variations WHERE product_id = $1", [Number(id)]);
    }
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
