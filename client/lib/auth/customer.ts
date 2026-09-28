"use server";

import { cookies } from "next/headers";
import { verifyJWTForStore } from "@/lib/jwt/storeAware";
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

  const decoded = await verifyJWTForStore(token);
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

// Igual ao requireCustomer, mas sem erro: devolve o id do cliente logado ou
// null (visitante). Usado por leituras públicas que só mudam pra quem é dono.
export async function getOptionalCustomerId(): Promise<number | null> {
  try {
    const token = (await cookies()).get("auth_token")?.value;
    if (!token) return null;
    const decoded = await verifyJWTForStore(token);
    if (!decoded?.email) return null;
    const { rows } = await getDB().query(`SELECT id FROM users WHERE email = $1`, [decoded.email]);
    return rows.length > 0 ? Number(rows[0].id) : null;
  } catch {
    return null;
  }
}
