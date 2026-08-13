"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

// Mesmas colunas de store_settings usadas pelo checkout/fixedTableProvider
// (platform_fee_*, shipping_markup_*, accepts_*) — CREATE TABLE IF NOT
// EXISTS não adiciona coluna em tabela já existente, então reforça aqui
// (mesma lição do bug de orders.user_id).
// O form manda número no formato BR (vírgula decimal, ex: "12,50") —
// Number() nativo não entende vírgula e viraria NaN silenciosamente.
function parseDecimal(value: unknown): number {
  if (typeof value !== "string") return Number(value) || 0;
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function ensureSchema() {
  const db = getDB();
  await db.query(`
    ALTER TABLE store_settings
      ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS platform_fee_fixed NUMERIC(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS shipping_markup_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS shipping_markup_fixed NUMERIC(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS accepts_pix BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS accepts_credit_card BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS accepts_boleto BOOLEAN NOT NULL DEFAULT FALSE
  `);
  return db;
}

export async function GET() {
  try {
    const { denied } = await requirePermission("payments.manage");
    if (denied) return denied;

    const db = await ensureSchema();
    const result = await db.query(
      `SELECT platform_fee_percent, platform_fee_fixed, shipping_markup_percent, shipping_markup_fixed,
              accepts_pix, accepts_credit_card, accepts_boleto
       FROM store_settings ORDER BY id DESC LIMIT 1`
    );

    return ok(result.rows[0] ?? null);
  } catch (error) {
    console.error("Erro ao buscar configurações de pagamento:", error);
    return fail("PAYMENT_SETTINGS_FETCH_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { denied } = await requirePermission("payments.manage");
    if (denied) return denied;

    const db = await ensureSchema();
    const body = await req.json();

    const current = await db.query(`SELECT id FROM store_settings ORDER BY id DESC LIMIT 1`);
    if (current.rows.length === 0) return fail("STORE_SETTINGS_NOT_FOUND", 404);

    const result = await db.query(
      `UPDATE store_settings
       SET platform_fee_percent = $1, platform_fee_fixed = $2,
           shipping_markup_percent = $3, shipping_markup_fixed = $4,
           accepts_pix = $5, accepts_credit_card = $6, accepts_boleto = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING platform_fee_percent, platform_fee_fixed, shipping_markup_percent, shipping_markup_fixed,
                 accepts_pix, accepts_credit_card, accepts_boleto`,
      [
        parseDecimal(body.platformFeePercent),
        parseDecimal(body.platformFeeFixed),
        parseDecimal(body.shippingMarkupPercent),
        parseDecimal(body.shippingMarkupFixed),
        Boolean(body.acceptsPix),
        Boolean(body.acceptsCreditCard),
        Boolean(body.acceptsBoleto),
        current.rows[0].id,
      ]
    );

    return ok(result.rows[0]);
  } catch (error) {
    console.error("Erro ao salvar configurações de pagamento:", error);
    return fail("PAYMENT_SETTINGS_SAVE_ERROR", 500);
  }
}
