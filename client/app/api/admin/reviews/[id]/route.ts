"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { denied } = await requirePermission("products.write");
    if (denied) return denied;

    const { id } = await params;
    const reviewId = Number(id);
    const body = await req.json();
    if (!reviewId || typeof body.hidden !== "boolean") return fail("INVALID_REQUEST", 400);

    const res = await getDB().query(`UPDATE product_reviews SET hidden = $1 WHERE id = $2`, [body.hidden, reviewId]);
    if (res.rowCount === 0) return fail("REVIEW_NOT_FOUND", 404);
    return ok({ updated: true });
  } catch (error) {
    console.error("Erro ao moderar avaliação:", error);
    return fail("REVIEW_UPDATE_ERROR", 500);
  }
}
