"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { requireCustomer } from "@/lib/auth/customer";

// Direito de exclusão (LGPD art. 18) — diferente da exportação, excluir
// uma conta tem consequências reais (pedidos, comissões de revendedor em
// aberto) e por isso não é instantâneo: só entra numa fila que o staff
// revisa (ver app/(private)/dashboard/components/DataRequestsPanel.tsx).
export async function POST() {
  const { userId, denied } = await requireCustomer();
  if (denied) return denied;

  const db = getDB();
  const existing = await db.query(
    `SELECT id FROM data_subject_requests WHERE user_id = $1 AND status = 'pending'`,
    [userId]
  );
  if (existing.rows.length > 0) {
    return ok({ alreadyRequested: true });
  }

  await db.query(`INSERT INTO data_subject_requests (user_id) VALUES ($1)`, [userId]);
  return ok({ alreadyRequested: false });
}

export async function GET() {
  const { userId, denied } = await requireCustomer();
  if (denied) return denied;

  const db = getDB();
  const result = await db.query(
    `SELECT status, requested_at FROM data_subject_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1`,
    [userId]
  );
  if (result.rows.length === 0) return fail("NOT_FOUND", 404);
  return ok(result.rows[0]);
}
