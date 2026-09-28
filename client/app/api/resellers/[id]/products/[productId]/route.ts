"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

type Params = { params: Promise<{ id: string; productId: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { denied } = await requirePermission("resellers.manage");
    if (denied) return denied;

    const { id, productId } = await params;
    const resellerId = Number(id);
    const prodId = Number(productId);
    if (!resellerId || !prodId) return fail("INVALID_ID", 400);

    const db = getDB();
    await db.query(`DELETE FROM reseller_products WHERE reseller_id = $1 AND product_id = $2`, [resellerId, prodId]);

    return ok({ removed: true });
  } catch (error) {
    console.error("Erro ao remover produto do revendedor:", error);
    return fail("RESELLER_PRODUCT_REMOVE_ERROR", 500);
  }
}
