"use server";

import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/jwt/init";
import { getDB } from "@/lib/database/db";
import { fail } from "@/lib/api/response";

// Resolve o cliente logado a partir do cookie de sessão. Mesmo padrão já
// usado (duplicado) em cart/route.ts e stock/deliver/route.ts: o JWT
// sempre carrega `email` (email-code, Discord e Google todos garantem uma
// linha em `users` por email antes de assinar o token), então email é o
// identificador canônico do cliente em todo o app.
export async function requireCustomer() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return { email: null, userId: null, denied: fail("UNAUTHORIZED_TOKEN", 401) };

  const decoded = await verifyJWT(token);
  if (!decoded || !decoded.email) {
    return { email: null, userId: null, denied: fail("UNAUTHORIZED_TOKEN", 401) };
  }

  const db = getDB();
  const { rows } = await db.query(`SELECT id FROM users WHERE email = $1`, [decoded.email]);
  if (rows.length === 0) {
    return { email: null, userId: null, denied: fail("USER_NOT_FOUND", 404) };
  }

  return { email: decoded.email as string, userId: rows[0].id as number, denied: null };
}
