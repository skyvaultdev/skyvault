import { getDB } from "@/lib/database/db";

// Antes duplicada em 3 arquivos de rota (coupon/add, coupons, coupon) —
// consolidada aqui, única fonte da verdade pro schema de coupons criado
// sob demanda. Ver db/migrations/PROPOSAL_consolidate_runtime_schema_changes.sql
// pra a proposta de mover isso tudo pra migration de vez.
export async function ensureCouponsSchema() {
  const db = getDB();
  await db.query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      percent_off NUMERIC(5,2) NOT NULL CHECK (percent_off >= 0 AND percent_off <= 100),
      usage_limit INT NOT NULL DEFAULT 0,
      used_count INT NOT NULL DEFAULT 0,
      per_user_limit INT NOT NULL DEFAULT 0,
      min_order_value NUMERIC(10,2),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    )
  `);
  return db;
}
