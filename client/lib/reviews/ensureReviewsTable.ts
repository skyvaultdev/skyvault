import { getDB } from "@/lib/database/db";

export async function ensureReviewsTable() {
  const db = getDB();
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_reviews (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      order_id INTEGER,
      reviewer_name TEXT,
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      image_urls TEXT[] NOT NULL DEFAULT '{}',
      hidden BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS product_reviews_product_idx ON product_reviews (product_id, created_at DESC)`);
  // Uma avaliação por cliente por produto.
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_user_product_idx ON product_reviews (user_id, product_id) WHERE user_id IS NOT NULL`);
}
