"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { ensureTeamTables } from "@/lib/team/team";
import { requireTeamActor } from "@/lib/team/guard";

export async function GET(req: Request) {
  try {
    const { denied } = await requireTeamActor();
    if (denied) return denied;
    await ensureTeamTables();

    const rawPage = Number(new URL(req.url).searchParams.get("page"));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;
    const pageSize = 20;
    const db = getDB();
    const [items, total] = await Promise.all([
      db.query(`SELECT id, actor_email, action, target, details, created_at FROM team_audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [pageSize, (page - 1) * pageSize]),
      db.query(`SELECT COUNT(*) AS total FROM team_audit_log`),
    ]);
    return ok({ items: items.rows, total: Number(total.rows[0].total), page, pageSize });
  } catch (error) {
    console.error("Erro ao listar auditoria:", error);
    return fail("TEAM_AUDIT_ERROR", 500);
  }
}
