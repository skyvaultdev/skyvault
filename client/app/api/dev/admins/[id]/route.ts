"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireDev } from "@/lib/devAuth/guard";

type Params = { params: Promise<{ id: string }> };

// Bloquear aqui não apaga nada — a próxima vez que a pessoa passar pelo
// middleware da loja (qualquer request pra /dashboard), sync-user vê
// blocked=true e zera role/permissions na hora, sem precisar esperar o
// token expirar.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { denied } = await requireDev();
    if (denied) return denied;

    const { id } = await params;
    const adminId = Number(id);
    if (!adminId) return fail("INVALID_ID", 400);

    const { blocked } = await req.json();

    const db = getDB();
    const result = await db.query(
      `UPDATE admin SET blocked = $1 WHERE id = $2 RETURNING id, email, role, blocked`,
      [Boolean(blocked), adminId]
    );

    if (result.rows.length === 0) return fail("NOT_FOUND", 404);
    return ok(result.rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar bloqueio de admin:", error);
    return fail("ADMIN_BLOCK_UPDATE_ERROR", 500);
  }
}
