"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { ensureTeamTables, logTeamAction } from "@/lib/team/team";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { session, denied } = await requirePermission("products.write");
    if (denied) return denied;
    await ensureTeamTables();

    var { id } = await params;
    const db = getDB();
    const current = await db.query("SELECT code FROM coupons WHERE id = $1", [Number(id)]);
    const result = await db.query("DELETE FROM coupons WHERE id=$1 RETURNING id", [Number(id)]);
    if (result.rows.length === 0) return fail("NOT_FOUND", 404);
    await logTeamAction(db, session?.email ?? "desconhecido", "coupon.delete", current.rows[0]?.code ?? `id ${id}`);
    return ok(result.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
