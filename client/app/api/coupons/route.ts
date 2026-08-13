"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

async function ensureCouponsSchema() {
  const db = getDB();
  await db.query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      percent_off NUMERIC(5,2) NOT NULL CHECK (percent_off >= 0 AND percent_off <= 100),
      usage_limit INT NOT NULL DEFAULT 0,
      used_count INT NOT NULL DEFAULT 0,
      min_order_value NUMERIC(10,2),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    )
  `);
  return db;
}

// Pública de propósito (usada no checkout pra validar um código), mas só
// devolve o cupom exato pedido — nunca a tabela inteira, pra não vazar
// códigos, limites de uso e valor mínimo de outros cupons.
export async function GET(req: Request) {
  try {
    var { searchParams } = new URL(req.url);
    var code = searchParams.get("code")?.trim().toUpperCase();
    if (!code) return fail("MISSING_CODE", 400);

    const db = await ensureCouponsSchema();
    const result = await db.query(
      `SELECT code, percent_off, min_order_value FROM coupons
       WHERE code = $1 AND active = true AND (expires_at IS NULL OR expires_at > NOW())
         AND (usage_limit = 0 OR used_count < usage_limit)`,
      [code]
    );
    if (result.rows.length === 0) return fail("COUPON_NOT_FOUND", 404);
    return ok(result.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { denied } = await requirePermission("products.write");
    if (denied) return denied;

    const db = await ensureCouponsSchema();
    var body = (await req.json()) as {
      code?: string;
      percentOff?: number;
      usageLimit?: number;
      minOrderValue?: number | null;
      active?: boolean;
      expiresAt?: string | null;
    };

    if (!body.code || !Number.isFinite(body.percentOff)) return fail("MISSING_FIELDS", 400);

    const result = await db.query(
      `INSERT INTO coupons (code, percent_off, usage_limit, min_order_value, active, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        body.code.trim().toUpperCase(),
        body.percentOff,
        body.usageLimit ?? 0,
        body.minOrderValue ?? null,
        body.active ?? true,
        body.expiresAt ?? null,
      ]
    );

    return ok(result.rows[0], 201);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
