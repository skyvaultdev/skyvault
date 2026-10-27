"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { requireSession } from "@/lib/auth/guard";
import { signJWT } from "@/lib/jwt/init";
import { verifyTotpCode } from "@/lib/auth/totp";

// Chamado pela tela de desafio (app/(private)/dashboard/2fa-challenge) —
// confirma o código TOTP e, se válido, reassina o auth_token com
// twoFaVerifiedAt. middlewares/auth.middleware.ts exige essa claim pra
// liberar /dashboard sempre que a conta tem totp_enabled.
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "");

  const db = getDB();
  const current = await db.query(`SELECT totp_secret, totp_enabled FROM admin WHERE email = $1`, [session.email]);
  const row = current.rows[0];
  if (!row?.totp_enabled || !row.totp_secret) {
    return NextResponse.json({ ok: false, error: "NOT_ENABLED" }, { status: 400 });
  }

  if (!verifyTotpCode(row.totp_secret, code)) {
    return NextResponse.json({ ok: false, error: "INVALID_CODE" }, { status: 400 });
  }

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
