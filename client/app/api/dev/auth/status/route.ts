"use server";

import { getDB } from "@/lib/database/db";
import { ok, fail } from "@/lib/api/response";
import { requireDevSession } from "@/lib/devAuth/guard";

// Público (sem auth) — só diz se já existe algum dev cadastrado, pra
// tela de login decidir entre mostrar "entrar" ou "criar o primeiro dev".
// E se o cookie atual já é uma sessão de dev válida.
export async function GET() {
  try {
    const db = getDB();
    const result = await db.query(`SELECT COUNT(*)::int AS count FROM dev_users`);
    const session = await requireDevSession();

    return ok({ bootstrapped: result.rows[0].count > 0, loggedIn: !!session, email: session?.email ?? null });
  } catch (error) {
    console.error("Erro ao checar status de dev:", error);
    return fail("DEV_STATUS_ERROR", 500);
  }
}
