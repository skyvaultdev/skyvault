"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { fail } from "@/lib/api/response";
import { verifyPassword } from "@/lib/security/password";
import { signDevJWT } from "@/lib/devAuth/jwt";
import { rateLimit } from "@/lib/security/rateLimit";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return fail("MISSING_CREDENTIALS", 400);

    if (!rateLimit(`dev-login:${String(email).toLowerCase()}`, 8, 10 * 60_000)) {
      return fail("TOO_MANY_REQUESTS", 429);
    }

    const db = getDB();
    const result = await db.query(`SELECT id, email, password_hash FROM dev_users WHERE email = $1`, [email]);
    const devUser = result.rows[0];

    // Mesma mensagem genérica pra email inexistente ou senha errada —
    // não dá dica de qual dos dois falhou.
    if (!devUser || !verifyPassword(password, devUser.password_hash)) {
      return fail("INVALID_CREDENTIALS", 401);
    }

    const token = await signDevJWT({ devId: devUser.id, email: devUser.email });
    const res = NextResponse.json({ ok: true });
    res.cookies.set("dev_auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return res;
  } catch (error) {
    console.error("Erro no login de dev:", error);
    return fail("DEV_LOGIN_ERROR", 500);
  }
}
