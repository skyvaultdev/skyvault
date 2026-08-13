"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireDev } from "@/lib/devAuth/guard";

async function ensureSchema() {
  const db = getDB();
  await db.query(`
    ALTER TABLE store_settings
      ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS suspended_reason TEXT
  `);
  return db;
}

export async function GET() {
  try {
    const { denied } = await requireDev();
    if (denied) return denied;

    const db = await ensureSchema();
    const result = await db.query(
      `SELECT store_name, suspended, suspended_reason FROM store_settings ORDER BY id DESC LIMIT 1`
    );

    return ok(result.rows[0] ?? { store_name: null, suspended: false, suspended_reason: null });
  } catch (error) {
    console.error("Erro ao buscar status da loja:", error);
    return fail("STORE_STATUS_FETCH_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { denied } = await requireDev();
    if (denied) return denied;

    const db = await ensureSchema();
    const { suspended, reason } = await req.json();

    const current = await db.query(`SELECT id FROM store_settings ORDER BY id DESC LIMIT 1`);
    if (current.rows.length === 0) return fail("STORE_SETTINGS_NOT_FOUND", 404);

    const result = await db.query(
      `UPDATE store_settings SET suspended = $1, suspended_reason = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING suspended, suspended_reason`,
      [Boolean(suspended), reason ?? null, current.rows[0].id]
    );

    return ok(result.rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar status da loja:", error);
    return fail("STORE_STATUS_UPDATE_ERROR", 500);
  }
}
