"use server";

import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/database/db";
import { fail } from "@/lib/api/response";
import { hashPassword } from "@/lib/security/password";
import { signDevJWT } from "@/lib/devAuth/jwt";

// Lançado dentro da transação quando a checagem "já existe algum dev"
// (com advisory lock) encontra um — precisa de um tipo próprio pra o
// catch de fora distinguir isso de um erro genérico e devolver 403 em
// vez de 500.
class DevAlreadyBootstrappedError extends Error {}

// Só cria o primeiro usuário dev — se já existe qualquer um, esse endpoint
// morre (nunca vira um jeito de criar mais devs sem já estar logado).
// Depois de bootar, use POST /api/dev/auth/login normalmente. Trocar de
// devs depois do primeiro precisa ser feito direto no banco (ou por um
// dev já logado, se/quando existir tela de convite).
export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return fail("INVALID_EMAIL", 400);
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return fail("WEAK_PASSWORD", 400);
    }

    const passwordHash = hashPassword(password);

    const devUser = await withTransaction(async (client) => {
      // pg_advisory_xact_lock serializa qualquer tentativa concorrente de
      // bootstrap — sem isso, duas POSTs simultâneas (antes de qualquer
      // dev existir) podiam ambas passar pelo SELECT (0 linhas) e inserir,
      // criando 2 contas dev em vez de só a primeira.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('dev-bootstrap'))`);

      const existing = await client.query(`SELECT id FROM dev_users LIMIT 1`);
      if (existing.rows.length > 0) {
        throw new DevAlreadyBootstrappedError();
      }

      const result = await client.query(
        `INSERT INTO dev_users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
        [email, passwordHash]
      );
      return result.rows[0];
    });

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
    if (error instanceof DevAlreadyBootstrappedError) {
      return fail("DEV_ALREADY_BOOTSTRAPPED", 403);
    }
    console.error("Erro no bootstrap de dev:", error);
    return fail("DEV_BOOTSTRAP_ERROR", 500);
  }
}
