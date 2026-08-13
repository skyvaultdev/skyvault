"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { denied } = await requirePermission("shipping.manage");
    if (denied) return denied;

    const { id } = await params;
    const carrierId = Number(id);
    if (!carrierId) return fail("INVALID_ID", 400);

    const db = getDB();
    const result = await db.query(`DELETE FROM carriers WHERE id = $1 RETURNING id`, [carrierId]);
    if (result.rows.length === 0) return fail("NOT_FOUND", 404);

    return ok({ deleted: true });
  } catch (error) {
    console.error("Erro ao remover transportadora:", error);
    return fail("CARRIER_REMOVE_ERROR", 500);
  }
}
