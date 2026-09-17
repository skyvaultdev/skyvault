"use server";

import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { ensurePromotionSettingsSchema } from "@/lib/pricing/promotionSettings";

type TierInput = { minSubtotal: number; percent: number };

function sanitizeTiers(raw: unknown): TierInput[] | null {
  if (!Array.isArray(raw)) return null;
  const tiers: TierInput[] = [];
  for (const item of raw) {
    const record = item as Record<string, unknown> | null;
    const minSubtotal = Number(record?.minSubtotal);
    const percent = Number(record?.percent);
    if (!Number.isFinite(minSubtotal) || minSubtotal < 0) return null;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
    tiers.push({ minSubtotal, percent });
  }
  return tiers;
}

export async function GET() {
  try {
    const { denied } = await requirePermission("store.customize");
    if (denied) return denied;

    const db = await ensurePromotionSettingsSchema();
    const result = await db.query(`SELECT * FROM store_promotion_settings ORDER BY id DESC LIMIT 1`);
    const row = result.rows[0];

    return ok({
      discountTiers: row?.discount_tiers ?? [],
      freeShippingEnabled: row?.free_shipping_enabled !== false,
      freeShippingThreshold: Number(row?.free_shipping_threshold ?? 150),
      minOrderValue: Number(row?.min_order_value ?? 0),
    });
  } catch (error) {
    console.error("Erro ao buscar configurações de promoção:", error);
    return fail("PROMOTION_SETTINGS_FETCH_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { denied } = await requirePermission("store.customize");
    if (denied) return denied;

    const body = await req.json();
    const discountTiers = sanitizeTiers(body.discountTiers);
    if (discountTiers === null) return fail("INVALID_DISCOUNT_TIERS", 400);

    const freeShippingEnabled = body.freeShippingEnabled !== false;
    const freeShippingThreshold = Number(body.freeShippingThreshold);
    const minOrderValue = Number(body.minOrderValue);
    if (!Number.isFinite(freeShippingThreshold) || freeShippingThreshold < 0) return fail("INVALID_FREE_SHIPPING_THRESHOLD", 400);
    if (!Number.isFinite(minOrderValue) || minOrderValue < 0) return fail("INVALID_MIN_ORDER_VALUE", 400);

    const db = await ensurePromotionSettingsSchema();
    const current = await db.query(`SELECT id FROM store_promotion_settings ORDER BY id DESC LIMIT 1`);

    let result;
    if (current.rows[0]) {
      result = await db.query(
        `UPDATE store_promotion_settings
         SET discount_tiers = $1, free_shipping_enabled = $2, free_shipping_threshold = $3, min_order_value = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING id`,
        [JSON.stringify(discountTiers), freeShippingEnabled, freeShippingThreshold, minOrderValue, current.rows[0].id]
      );
    } else {
      result = await db.query(
        `INSERT INTO store_promotion_settings (discount_tiers, free_shipping_enabled, free_shipping_threshold, min_order_value)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [JSON.stringify(discountTiers), freeShippingEnabled, freeShippingThreshold, minOrderValue]
      );
    }

    return ok({ saved: true, id: result.rows[0].id });
  } catch (error) {
    console.error("Erro ao salvar configurações de promoção:", error);
    return fail("PROMOTION_SETTINGS_SAVE_ERROR", 500);
  }
}
