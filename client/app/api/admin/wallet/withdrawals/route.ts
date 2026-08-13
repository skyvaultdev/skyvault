"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

export async function GET() {
  try {
    const { denied } = await requirePermission("wallet.manage");
    if (denied) return denied;

    const db = getDB();
    const result = await db.query(
      `SELECT w.*, req.email AS requested_by_email, proc.email AS processed_by_email
       FROM withdrawal_requests w
       LEFT JOIN admin req ON req.id = w.requested_by_admin_id
       LEFT JOIN admin proc ON proc.id = w.processed_by_admin_id
       ORDER BY w.requested_at DESC
       LIMIT 100`
    );

    return ok(result.rows);
  } catch (error) {
    console.error("Erro ao listar resgates:", error);
    return fail("WITHDRAWALS_LIST_ERROR", 500);
  }
}
