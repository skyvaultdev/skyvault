"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { requirePermission } from "@/lib/auth/guard";

// users.manage (só owner, ver lib/jwt/permissions.ts) — anonimizar uma
// conta é mais sensível que as outras ações de "store.customize".
export async function GET() {
  try {
    const { denied } = await requirePermission("users.manage");
    if (denied) return denied;

    const db = getDB();
    const result = await db.query(
      `SELECT r.id, r.status, r.requested_at, r.processed_at, r.processed_by, u.id AS user_id, u.email, u.username
       FROM data_subject_requests r
       JOIN users u ON u.id = r.user_id
       ORDER BY r.status ASC, r.requested_at ASC`
    );
    return ok(result.rows);
  } catch (error) {
    console.error("Erro ao listar solicitações de dados:", error);
    return fail("INTERNAL_ERROR", 500);
  }
}
