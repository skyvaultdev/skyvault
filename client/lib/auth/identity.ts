"use server";

import { getDB } from "@/lib/database/db";

export async function upsertCanonicalUser(email: string, username: string): Promise<number> {
  const db = getDB();

  await db.query(
    `INSERT INTO users (username, email, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (email) DO NOTHING`,
    [username, email]
  );

  const { rows } = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);
  return rows[0].id;
}

export async function resolveUserId(decoded: { sub?: string; email?: string }): Promise<number | null> {
  if (decoded.sub) return Number(decoded.sub);
  if (!decoded.email) return null;

  const db = getDB();
  const { rows } = await db.query(`SELECT id FROM users WHERE email = $1`, [decoded.email]);
  return rows[0]?.id ?? null;
}
