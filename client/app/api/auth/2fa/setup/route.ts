"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { requirePermission } from "@/lib/auth/guard";
import { generateTotpSecret, buildTotpUri, verifyTotpStep } from "@/lib/auth/totp";
import { config } from "@/config/configuration";
import { rateLimit } from "@/lib/security/rateLimit";

// Qualquer staff com acesso ao dashboard pode ligar 2FA pra PRÓPRIA conta
// — não é forçado, e não depende de team.manage (senão admin/editor nunca
// conseguiriam proteger a própria conta).
export async function GET() {
  const { session, denied } = await requirePermission("dashboard.access");
  if (denied) return denied;

  const db = getDB();
  const current = await db.query(`SELECT totp_secret, totp_enabled FROM admin WHERE email = $1`, [session!.email]);
  if (current.rows[0]?.totp_enabled) {
    return ok({ enabled: true });
  }

  // Gera um secret novo a cada GET enquanto não confirmado — evita reusar
  // um secret velho de uma tentativa de setup abandonada. Zera
  // totp_last_step junto: um número de passo de um secret anterior não
  // tem relação nenhuma com o secret novo.
  const secret = generateTotpSecret();
  await db.query(
    `UPDATE admin SET totp_secret = $1, totp_last_step = NULL WHERE email = $2`,
    [secret, session!.email]
  );

  return ok({
    enabled: false,
    secret,
    uri: buildTotpUri(secret, session!.email, config.platform.legalName || "Loja"),
  });
}

// Confirma o setup: precisa digitar um código válido gerado a partir do
// secret acima pra provar que o app autenticador foi configurado certo
// antes de ligar o 2FA de verdade.
export async function POST(req: Request) {
  const { session, denied } = await requirePermission("dashboard.access");
  if (denied) return denied;

  if (!rateLimit(`2fa-setup:${session!.email}`, 5, 5 * 60_000)) {
    return fail("TOO_MANY_REQUESTS", 429, { "Retry-After": "300" });
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "");

  const db = getDB();
  const current = await db.query(`SELECT totp_secret, totp_last_step FROM admin WHERE email = $1`, [session!.email]);
  const secret = current.rows[0]?.totp_secret;
  if (!secret) return fail("SETUP_NOT_STARTED", 400);

  const matchedStep = verifyTotpStep(secret, code);
  if (matchedStep === null) {
    return fail("INVALID_CODE", 400);
  }
  const lastStep = current.rows[0]?.totp_last_step != null ? Number(current.rows[0].totp_last_step) : null;
  if (lastStep !== null && matchedStep <= lastStep) {
    return fail("CODE_ALREADY_USED", 400);
  }

  await db.query(`UPDATE admin SET totp_enabled = true, totp_last_step = $1 WHERE email = $2`, [matchedStep, session!.email]);
  return ok({ enabled: true });
}
