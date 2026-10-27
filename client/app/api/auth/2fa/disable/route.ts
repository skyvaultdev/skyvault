"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { requirePermission } from "@/lib/auth/guard";
import { verifyTotpCode } from "@/lib/auth/totp";

// Exige o código atual pra desligar — sem isso, uma sessão comprometida
// (cookie roubado) poderia desligar o 2FA silenciosamente sem precisar
// saber o código, o que anularia a proteção que ele deveria dar.
export async function POST(req: Request) {
  const { session, denied } = await requirePermission("dashboard.access");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "");

  const db = getDB();
  const current = await db.query(`SELECT totp_secret, totp_enabled FROM admin WHERE email = $1`, [session?.email]);
  const row = current.rows[0];
  if (!row?.totp_enabled) return fail("NOT_ENABLED", 400);

  if (!verifyTotpCode(row.totp_secret, code)) {
    return fail("INVALID_CODE", 400);
  }

  await db.query(`UPDATE admin SET totp_enabled = false, totp_secret = NULL WHERE email = $1`, [session?.email]);
  return ok({ enabled: false });
}
