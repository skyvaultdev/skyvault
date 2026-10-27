"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { requirePermission } from "@/lib/auth/guard";
import { generateTotpSecret, buildTotpUri, verifyTotpCode } from "@/lib/auth/totp";
import { config } from "@/config/configuration";

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
  // um secret velho de uma tentativa de setup abandonada.
  const secret = generateTotpSecret();
  await db.query(
    `UPDATE admin SET totp_secret = $1 WHERE email = $2`,
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

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "");

  const db = getDB();
  const current = await db.query(`SELECT totp_secret FROM admin WHERE email = $1`, [session!.email]);
  const secret = current.rows[0]?.totp_secret;
  if (!secret) return fail("SETUP_NOT_STARTED", 400);

  if (!verifyTotpCode(secret, code)) {
    return fail("INVALID_CODE", 400);
  }

  await db.query(`UPDATE admin SET totp_enabled = true WHERE email = $1`, [session!.email]);
  return ok({ enabled: true });
}
