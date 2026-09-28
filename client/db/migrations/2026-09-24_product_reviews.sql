-- Avaliações de produto: só quem comprou (pedido pago/entregue) avalia,
-- uma avaliação por cliente por produto, nota 1-5, texto e até 4 imagens.
-- "Aprovação" exibida na página = % de avaliações com nota >= 4.
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
);
CREATE INDEX IF NOT EXISTS product_reviews_product_idx ON product_reviews (product_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_user_product_idx ON product_reviews (user_id, product_id) WHERE user_id IS NOT NULL;
