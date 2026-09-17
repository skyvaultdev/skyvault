import { getDB } from "@/lib/database/db";
import { DEFAULT_PROMOTION_SETTINGS, type PromotionSettings, type DiscountTier } from "./cartDiscount";

// Auto-cria a tabela se a migração ainda não rodou — mesmo padrão usado em
// app/api/coupons/route.ts, app/api/admin/payment-settings/route.ts etc.
// Sem isso, checkout inteiro (create-order incluído) quebrava com "relação
// não existe" só porque ninguém tinha rodado a migração ainda.
export async function ensurePromotionSettingsSchema() {
  const db = getDB();
  await db.query(`
    CREATE TABLE IF NOT EXISTS store_promotion_settings (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      discount_tiers JSONB NOT NULL DEFAULT '[]',
      free_shipping_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      free_shipping_threshold NUMERIC(10,2) NOT NULL DEFAULT 150,
      min_order_value NUMERIC(10,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return db;
}

function normalizeTiers(raw: unknown): DiscountTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is { minSubtotal: unknown; percent: unknown } => !!t && typeof t === "object")
    .map((t) => ({ minSubtotal: Number(t.minSubtotal), percent: Number(t.percent) }))
    .filter((t) => Number.isFinite(t.minSubtotal) && t.minSubtotal >= 0 && Number.isFinite(t.percent) && t.percent >= 0 && t.percent <= 100);
}

// Lê store_promotion_settings — singleton, mesmo padrão de store_settings.
// Se a loja nunca salvou nada (tabela vazia, primeira vez), cai nos
// defaults de fábrica; a partir da primeira gravação pela aba Geral, quem
// manda é sempre o que está no banco (inclusive "sem nenhum degrau", se o
// dono apagar todos).
export async function loadPromotionSettings(): Promise<PromotionSettings> {
  const db = await ensurePromotionSettingsSchema();
  const result = await db.query(`SELECT * FROM store_promotion_settings ORDER BY id DESC LIMIT 1`);
  const row = result.rows[0];
  if (!row) return DEFAULT_PROMOTION_SETTINGS;

  return {
    discountTiers: normalizeTiers(row.discount_tiers),
    freeShippingEnabled: row.free_shipping_enabled !== false,
    freeShippingThreshold: Number(row.free_shipping_threshold) || 0,
    minOrderValue: Number(row.min_order_value) || 0,
  };
}
