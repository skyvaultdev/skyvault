-- Programa de revendedores: qualquer cliente pode se candidatar, o owner
-- aprova e escolhe quais produtos cada revendedor pode vender (com a %
-- de comissão daquele produto pra aquele revendedor especificamente —
-- não existe uma % global). Comissão só é gravada quando o pedido
-- realmente confirma (paid/delivered em confirmOrderPayment), nunca antes
-- — evita ter que estornar comissão de pedido que nunca chegou a pagar.
CREATE TABLE IF NOT EXISTS resellers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | suspended
  display_name TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS resellers_user_id_idx ON resellers (user_id);

-- Autorização por produto: sem linha aqui = revendedor não pode vender
-- (nem ganha comissão por) aquele produto, mesmo que aprovado no geral.
CREATE TABLE IF NOT EXISTS reseller_products (
  id SERIAL PRIMARY KEY,
  reseller_id INTEGER NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  commission_percent NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reseller_id, product_id)
);

-- Atribuição é por PEDIDO (não por item) — cookie de referral de último
-- clique, gravado no pedido na criação (create-order). Simples e é o
-- modelo padrão de programas de afiliado; um item só gera comissão se o
-- revendedor tiver autorização pra aquele produto especificamente.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_id INTEGER REFERENCES resellers(id) ON DELETE SET NULL;

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
  status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | cancelled | paid
  payout_request_id INTEGER,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reseller_commissions_reseller_idx ON reseller_commissions (reseller_id);
-- Um order_item só pode gerar UMA comissão — garante idempotência se
-- confirmOrderPayment ou a reconciliação de entrega rodar mais de uma vez.
CREATE UNIQUE INDEX IF NOT EXISTS reseller_commissions_order_item_idx ON reseller_commissions (order_item_id) WHERE order_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reseller_payout_requests (
  id SERIAL PRIMARY KEY,
  reseller_id INTEGER NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested', -- requested | approved | rejected | paid
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS reseller_payout_requests_reseller_idx ON reseller_payout_requests (reseller_id);

-- payout_request_id não tem FK formal de propósito — o ensure*() abaixo
-- roda em toda request (padrão deste projeto) e "ADD CONSTRAINT IF NOT
-- EXISTS" não existe no Postgres pra constraints normais; só nós
-- escrevemos essa coluna (reseller_payout_requests/route.ts), então a
-- integridade é garantida em código, não pelo schema.
