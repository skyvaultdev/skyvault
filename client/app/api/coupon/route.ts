"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

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

export async function GET() {
  try {
    const db = await ensureCouponsSchema();
    const result = await db.query("SELECT * FROM coupons ORDER BY created_at DESC");
    return ok(result.rows);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
