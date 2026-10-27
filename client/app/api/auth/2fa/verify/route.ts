"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { requireSession } from "@/lib/auth/guard";
import { signJWT } from "@/lib/jwt/init";
import { verifyTotpStep } from "@/lib/auth/totp";
import { rateLimit } from "@/lib/security/rateLimit";

// Chamado pela tela de desafio (app/(private)/dashboard/2fa-challenge) —
// confirma o código TOTP e, se válido, reassina o auth_token com
// twoFaVerifiedAt. middlewares/auth.middleware.ts exige essa claim pra
// liberar /dashboard sempre que a conta tem totp_enabled.
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Chave por email (identificador de conta de staff usado em todo o resto
  // do app — a sessão não carrega um id numérico de admin) — mesmo padrão
  // de otp-verify/otp-send pro login de cliente. Sem isso, um auth_token
  // roubado permitiria martelar o código de 6 dígitos sem limite.
  if (!rateLimit(`2fa-verify:${session.email}`, 5, 5 * 60_000)) {
    return NextResponse.json(
      { ok: false, error: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": "300" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "");

  const db = getDB();
  const current = await db.query(`SELECT totp_secret, totp_enabled, totp_last_step FROM admin WHERE email = $1`, [session.email]);
  const row = current.rows[0];
  if (!row?.totp_enabled || !row.totp_secret) {
    return NextResponse.json({ ok: false, error: "NOT_ENABLED" }, { status: 400 });
  }

  const matchedStep = verifyTotpStep(row.totp_secret, code);
  if (matchedStep === null) {
    return NextResponse.json({ ok: false, error: "INVALID_CODE" }, { status: 400 });
  }
  // Replay: mesmo um código correto não pode ser reaproveitado dentro da
  // janela de tolerância (±1 passo de 30s) — só vale pro passo mais novo
  // já aceito em diante.
  const lastStep = row.totp_last_step != null ? Number(row.totp_last_step) : null;
  if (lastStep !== null && matchedStep <= lastStep) {
    return NextResponse.json({ ok: false, error: "CODE_ALREADY_USED" }, { status: 400 });
  }
  await db.query(`UPDATE admin SET totp_last_step = $1 WHERE email = $2`, [matchedStep, session.email]);

  const newToken = await signJWT({
    sid: session.sid,
    email: session.email,
    role: session.role,
    permissions: session.permissions,
    twoFaVerifiedAt: Date.now(),
  });

  const response = NextResponse.json({ ok: true, data: { verified: true } });
  response.cookies.set("auth_token", newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
