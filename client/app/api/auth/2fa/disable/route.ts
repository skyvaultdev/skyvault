"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { requirePermission } from "@/lib/auth/guard";
import { verifyTotpStep } from "@/lib/auth/totp";
import { rateLimit } from "@/lib/security/rateLimit";

// Exige o código atual pra desligar — sem isso, uma sessão comprometida
// (cookie roubado) poderia desligar o 2FA silenciosamente sem precisar
// saber o código, o que anularia a proteção que ele deveria dar.
export async function POST(req: Request) {
  const { session, denied } = await requirePermission("dashboard.access");
  if (denied) return denied;

  if (!rateLimit(`2fa-disable:${session!.email}`, 5, 5 * 60_000)) {
    return fail("TOO_MANY_REQUESTS", 429, { "Retry-After": "300" });
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "");

  const db = getDB();
  const current = await db.query(`SELECT totp_secret, totp_enabled, totp_last_step FROM admin WHERE email = $1`, [session?.email]);
  const row = current.rows[0];
  if (!row?.totp_enabled) return fail("NOT_ENABLED", 400);

  const matchedStep = verifyTotpStep(row.totp_secret, code);
  if (matchedStep === null) {
    return fail("INVALID_CODE", 400);
  }
  const lastStep = row.totp_last_step != null ? Number(row.totp_last_step) : null;
  if (lastStep !== null && matchedStep <= lastStep) {
    return fail("CODE_ALREADY_USED", 400);
  }

  await db.query(`UPDATE admin SET totp_enabled = false, totp_secret = NULL, totp_last_step = NULL WHERE email = $1`, [session?.email]);
  return ok({ enabled: false });
}
