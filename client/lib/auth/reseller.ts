"use server";

import { cookies } from "next/headers";
import { verifyJWTForStore } from "@/lib/jwt/storeAware";
import { getDB } from "@/lib/database/db";
import { fail } from "@/lib/api/response";
import { ensureResellerTables } from "@/lib/resellers/ensureResellerTables";

// Revendedor é uma conta de CLIENTE normal (mesmo auth_token/JWT da loja)
// com uma linha aprovada em `resellers` — não é um cargo de staff, não usa
// o sistema de permissions.ts. Mesmo padrão de requireCustomer()
// (lib/auth/customer.ts), só que também exige status = 'approved'.
export async function requireReseller() {
  await ensureResellerTables();

  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return { reseller: null, userId: null, denied: fail("UNAUTHORIZED_TOKEN", 401) };

  const decoded = await verifyJWTForStore(token);
  if (!decoded || !decoded.email) {
    return { reseller: null, userId: null, denied: fail("UNAUTHORIZED_TOKEN", 401) };
  }

  const db = getDB();
  const { rows } = await db.query(
    `SELECT r.*, u.id AS user_id FROM resellers r JOIN users u ON u.id = r.user_id WHERE u.email = $1`,
    [decoded.email]
  );
  if (rows.length === 0) {
    return { reseller: null, userId: null, denied: fail("NOT_A_RESELLER", 404) };
  }
  if (rows[0].status !== "approved") {
    return { reseller: rows[0], userId: rows[0].user_id, denied: fail("RESELLER_NOT_APPROVED", 403) };
  }

  return { reseller: rows[0], userId: rows[0].user_id as number, denied: null };
}
