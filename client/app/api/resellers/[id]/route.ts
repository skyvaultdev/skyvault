"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

type Params = { params: Promise<{ id: string }> };

const ALLOWED_STATUSES = ["approved", "rejected", "suspended", "pending"];

// Aprova/rejeita/suspende um revendedor — ação isolada de "gerenciar
// produtos autorizados" (isso é em [id]/products/route.ts), pra aprovar
// alguém não exigir já ter escolhido produto nenhum.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { session, denied } = await requirePermission("resellers.manage");
    if (denied) return denied;

    const { id } = await params;
    const resellerId = Number(id);
    if (!resellerId) return fail("INVALID_RESELLER_ID", 400);

    const body = await req.json();
    const status = String(body.status ?? "");
    if (!ALLOWED_STATUSES.includes(status)) return fail("INVALID_STATUS", 400);
    const note = body.note ? String(body.note).trim().slice(0, 500) || null : null;

    const db = getDB();
    const existing = await db.query(`SELECT id, status FROM resellers WHERE id = $1`, [resellerId]);
    if (existing.rows.length === 0) return fail("RESELLER_NOT_FOUND", 404);

    const approvedAtClause = status === "approved" ? `NOW()` : `approved_at`;
    await db.query(
      `UPDATE resellers SET status = $1, note = COALESCE($2, note), approved_by = $3, approved_at = ${approvedAtClause} WHERE id = $4`,
      [status, note, session?.email ?? null, resellerId]
    );

    return ok({ updated: true, status });
  } catch (error) {
    console.error("Erro ao atualizar revendedor:", error);
    return fail("RESELLER_UPDATE_ERROR", 500);
  }
}
