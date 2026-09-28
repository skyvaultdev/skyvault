-- Registro de falhas de entrega: gravado sempre que o pagamento foi
-- aprovado pelo Mercado Pago (dinheiro já cobrado) mas confirmOrderPayment
-- lançou exceção depois disso (baixa de estoque, geração de item digital,
-- etc.) — nunca pode só sumir num log de console, já que o cliente pagou e
-- corre o risco de nunca receber o produto. resolved_at/resolved_by ficam
-- nulos até alguém do staff reconciliar manualmente (reprocessar
-- confirmOrderPayment pro order_id depois de corrigir a causa raiz).
CREATE TABLE IF NOT EXISTS delivery_failures (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  error_message TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS delivery_failures_order_idx ON delivery_failures (order_id);
CREATE INDEX IF NOT EXISTS delivery_failures_unresolved_idx ON delivery_failures (resolved_at) WHERE resolved_at IS NULL;
