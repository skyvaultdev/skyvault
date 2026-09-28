"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

export async function GET() {
  try {
    const { denied } = await requirePermission("resellers.manage");
    if (denied) return denied;

    const db = getDB();
    const rows = await db.query(
      `SELECT p.*, u.email AS reseller_email, r.display_name
       FROM reseller_payout_requests p
       JOIN resellers r ON r.id = p.reseller_id
       JOIN users u ON u.id = r.user_id
       ORDER BY (p.status = 'requested') DESC, p.requested_at DESC`
    );
    return ok(rows.rows);
  } catch (error) {
    console.error("Erro ao listar solicitações de saque:", error);
    return fail("PAYOUT_REQUESTS_FETCH_ERROR", 500);
  }
}
