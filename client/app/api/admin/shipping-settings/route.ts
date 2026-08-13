"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

async function ensureSchema() {
  const db = getDB();
  await db.query(`ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS origin_cep TEXT`);
  return db;
}

export async function GET() {
  try {
    const { denied } = await requirePermission("shipping.manage");
    if (denied) return denied;

    const db = await ensureSchema();
    const result = await db.query(`SELECT origin_cep FROM store_settings ORDER BY id DESC LIMIT 1`);

    return ok(result.rows[0] ?? { origin_cep: null });
  } catch (error) {
    console.error("Erro ao buscar configurações de frete:", error);
    return fail("SHIPPING_SETTINGS_FETCH_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { denied } = await requirePermission("shipping.manage");
    if (denied) return denied;

    const db = await ensureSchema();
    const { originCep } = await req.json();
    const cepDigits = String(originCep ?? "").replace(/\D/g, "");
    if (cepDigits.length !== 8) return fail("INVALID_CEP", 400);

    const current = await db.query(`SELECT id FROM store_settings ORDER BY id DESC LIMIT 1`);
    if (current.rows.length === 0) return fail("STORE_SETTINGS_NOT_FOUND", 404);

    const result = await db.query(
      `UPDATE store_settings SET origin_cep = $1, updated_at = NOW() WHERE id = $2 RETURNING origin_cep`,
      [cepDigits, current.rows[0].id]
    );

    return ok(result.rows[0]);
  } catch (error) {
    console.error("Erro ao salvar configurações de frete:", error);
    return fail("SHIPPING_SETTINGS_SAVE_ERROR", 500);
  }
}
