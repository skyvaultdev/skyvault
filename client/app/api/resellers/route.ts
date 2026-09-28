"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { ensureResellerTables } from "@/lib/resellers/ensureResellerTables";

export async function GET() {
  try {
    const { denied } = await requirePermission("resellers.manage");
    if (denied) return denied;

    await ensureResellerTables();
    const db = getDB();

    const rows = await db.query(
      `SELECT
         r.id, r.referral_code, r.status, r.display_name, r.applied_at, r.approved_at, r.note,
         u.email, u.username,
         COALESCE((SELECT COUNT(*) FROM reseller_products rp WHERE rp.reseller_id = r.id), 0) AS authorized_products,
         COALESCE((SELECT SUM(commission_amount) FROM reseller_commissions c WHERE c.reseller_id = r.id AND c.status = 'confirmed'), 0) AS balance_due,
         COALESCE((SELECT SUM(commission_amount) FROM reseller_commissions c WHERE c.reseller_id = r.id AND c.status = 'paid'), 0) AS total_paid,
         COALESCE((SELECT COUNT(*) FROM reseller_payout_requests p WHERE p.reseller_id = r.id AND p.status = 'requested'), 0) AS pending_payout_requests
       FROM resellers r
       JOIN users u ON u.id = r.user_id
       ORDER BY (r.status = 'pending') DESC, r.applied_at DESC`
    );

    return ok(rows.rows);
  } catch (error) {
    console.error("Erro ao listar revendedores:", error);
    return fail("RESELLERS_FETCH_ERROR", 500);
  }
}
