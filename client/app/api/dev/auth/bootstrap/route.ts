"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { fail } from "@/lib/api/response";
import { hashPassword } from "@/lib/security/password";
import { signDevJWT } from "@/lib/devAuth/jwt";

// Só cria o primeiro usuário dev — se já existe qualquer um, esse endpoint
// morre (nunca vira um jeito de criar mais devs sem já estar logado).
// Depois de bootar, use POST /api/dev/auth/login normalmente. Trocar de
// devs depois do primeiro precisa ser feito direto no banco (ou por um
// dev já logado, se/quando existir tela de convite).
export async function POST(req: Request) {
  try {
    const db = getDB();
    const existing = await db.query(`SELECT id FROM dev_users LIMIT 1`);
    if (existing.rows.length > 0) {
      return fail("DEV_ALREADY_BOOTSTRAPPED", 403);
    }

    const { email, password } = await req.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return fail("INVALID_EMAIL", 400);
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return fail("WEAK_PASSWORD", 400);
    }

    const passwordHash = hashPassword(password);
    const result = await db.query(
      `INSERT INTO dev_users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
      [email, passwordHash]
    );
    const devUser = result.rows[0];

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
    console.error("Erro no bootstrap de dev:", error);
    return fail("DEV_BOOTSTRAP_ERROR", 500);
  }
}
