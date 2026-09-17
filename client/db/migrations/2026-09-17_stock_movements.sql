-- Ledger de movimentações de estoque — toda baixa por venda, estorno por
-- cancelamento/devolução, e registro manual (cadastro/edição de produto,
-- configuração de estoque digital) grava uma linha aqui. change é sempre
-- relativo (negativo = saiu, positivo = entrou); product_id/variation_id
-- usam ON DELETE SET NULL pra o histórico sobreviver mesmo se o produto for
-- removido depois (por isso product_name/variation_name também são
-- gravados como snapshot, não só via join).
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variation_id INTEGER REFERENCES product_variations(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  variation_name TEXT,
  change INTEGER NOT NULL,
  reason TEXT NOT NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  note TEXT,
  staff_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements (product_id);
CREATE INDEX IF NOT EXISTS stock_movements_order_idx ON stock_movements (order_id);
CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON stock_movements (created_at DESC);
