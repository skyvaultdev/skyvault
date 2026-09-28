import { getDB } from "@/lib/database/db";

// Auto-cria tudo se a migração ainda não rodou — mesmo padrão usado em
// outras tabelas novas deste projeto (ver ensureStockMovementsTable()).
export async function ensureResellerTables() {
  const db = getDB();

  await db.query(`
    CREATE TABLE IF NOT EXISTS resellers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referral_code TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      display_name TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      approved_by TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS resellers_user_id_idx ON resellers (user_id)`);
  await db.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS pix_key TEXT`);
  await db.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS pix_key_type TEXT`);
  await db.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS pix_holder_name TEXT`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS reseller_products (
      id SERIAL PRIMARY KEY,
      reseller_id INTEGER NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      commission_percent NUMERIC(5,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (reseller_id, product_id)
    )
  `);

  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_id INTEGER REFERENCES resellers(id) ON DELETE SET NULL`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS reseller_commissions (
      id SERIAL PRIMARY KEY,
      reseller_id INTEGER NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      sale_amount NUMERIC(10,2) NOT NULL,
      commission_percent NUMERIC(5,2) NOT NULL,
      commission_amount NUMERIC(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      payout_request_id INTEGER,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS reseller_commissions_reseller_idx ON reseller_commissions (reseller_id)`);
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS reseller_commissions_order_item_idx ON reseller_commissions (order_item_id) WHERE order_item_id IS NOT NULL`
  );

  await db.query(`
    CREATE TABLE IF NOT EXISTS reseller_payout_requests (
      id SERIAL PRIMARY KEY,
      reseller_id INTEGER NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT,
      note TEXT
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS reseller_payout_requests_reseller_idx ON reseller_payout_requests (reseller_id)`);
}
