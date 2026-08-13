-- =====================================================================
-- Migração: checkout completo (digital + físico), pagamentos, frete,
-- perfil do cliente e saldo único da loja.
-- Script idempotente — pode rodar de novo sem risco, mesmo que parte
-- dele já tenha sido aplicada antes (product_type, orders.shipping_*,
-- shipping_addresses, carriers, shipments já existiam de uma migração
-- anterior desta mesma iniciativa).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipo de produto (digital/físico) — base já usada pelo admin de produtos
-- ---------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE product_kind AS ENUM ('digital', 'physical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_type product_kind NOT NULL DEFAULT 'digital';

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS weight_grams INTEGER,
  ADD COLUMN IF NOT EXISTS length_cm NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS width_cm NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC(6,2);

CREATE INDEX IF NOT EXISTS idx_products_product_type ON products(product_type);

ALTER TABLE product_variations
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS weight_grams INTEGER,
  ADD COLUMN IF NOT EXISTS length_cm NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS width_cm NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC(6,2);

-- Estoque físico usa stock_count/is_unlimited (já existentes) — mesmo
-- conceito que keys/arquivos já usam pra "quantidade disponível".
-- stock_type (key/file/infinite) só é relevante quando product_type='digital'.

-- ---------------------------------------------------------------------
-- Pedidos: dados de pagamento, breakdown de preço, snapshot do tipo do item
-- ---------------------------------------------------------------------

-- CREATE TABLE IF NOT EXISTS não faz nada se a tabela já existe — então se
-- a orders/order_items do seu banco divergem da definição original em
-- dbatual.txt (ex: foi criada antes de alguma coluna existir), essas
-- colunas base nunca chegam a existir. Reforça aqui, idempotente.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS total NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_id BIGINT REFERENCES coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_ref TEXT,
  ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_address_id BIGINT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Vocabulário esperado pra orders.status (coluna continua TEXT livre):
--   pending_payment -> paid -> preparing -> shipped -> delivered
--   (ou 'delivered' direto pra pedidos 100% digitais) / cancelled / refunded

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_ref ON orders(payment_ref) WHERE payment_ref IS NOT NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variation_id BIGINT REFERENCES product_variations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS variation_name TEXT,
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_type product_kind NOT NULL DEFAULT 'digital',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- ---------------------------------------------------------------------
-- Endereços de entrega (snapshot do pedido) + perfil do cliente (endereço
-- salvo/reutilizável, chave = email — não user_id, pra resolver direto do
-- claim do JWT sem depender de qual das 3 tabelas de login originou o id)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS shipping_addresses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  cep TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL,
  state CHAR(2) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipping_addresses_user ON shipping_addresses(user_id);

DO $$ BEGIN
    ALTER TABLE orders ADD CONSTRAINT fk_orders_shipping_address
      FOREIGN KEY (shipping_address_id) REFERENCES shipping_addresses(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS customer_profiles (
  email CITEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  cep TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state CHAR(2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Transportadoras e envios
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS carriers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  service_code TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
    CREATE TYPE shipment_status AS ENUM ('preparing', 'posted', 'in_transit', 'delivered', 'returned', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS shipments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier_id BIGINT REFERENCES carriers(id) ON DELETE SET NULL,
  tracking_code TEXT,
  status shipment_status NOT NULL DEFAULT 'preparing',
  shipping_cost NUMERIC(10,2),
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);

-- Auditoria das cotações de frete mostradas/escolhidas no checkout
CREATE TABLE IF NOT EXISTS shipping_quotes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  carrier_id BIGINT REFERENCES carriers(id) ON DELETE SET NULL,
  service_name TEXT,
  price NUMERIC(10,2) NOT NULL,
  eta_days INT,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipping_quotes_order ON shipping_quotes(order_id);

-- ---------------------------------------------------------------------
-- Pagamentos (EfiBank) — 1 pedido pode ter várias tentativas
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'efibank',
  provider_txid TEXT,
  method TEXT NOT NULL CHECK (method IN ('pix', 'credit_card', 'boleto')),
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'pending', 'paid', 'expired', 'failed', 'refunded')),
  amount NUMERIC(10,2) NOT NULL,
  idempotency_key TEXT UNIQUE,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_tx_order ON payment_transactions(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_tx_provider_txid
  ON payment_transactions(provider, provider_txid) WHERE provider_txid IS NOT NULL;

-- ---------------------------------------------------------------------
-- Saldo único da loja — ledger append-only (nunca um UPDATE de saldo
-- direto). balance_after é cache de leitura; a fonte da verdade é
-- SUM(amount). Concorrência: usar pg_advisory_xact_lock(hashtext('wallet'))
-- na mesma transação antes de ler o saldo/inserir uma linha nova.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  withdrawal_request_id BIGINT,
  type TEXT NOT NULL CHECK (type IN ('sale_credit', 'withdrawal_debit', 'refund_debit', 'adjustment')),
  amount NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created_at ON wallet_ledger(created_at);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requested_by_admin_id BIGINT NOT NULL REFERENCES admin(id) ON DELETE RESTRICT,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payout_method TEXT,
  payout_details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by_admin_id BIGINT REFERENCES admin(id) ON DELETE SET NULL
);

DO $$ BEGIN
    ALTER TABLE wallet_ledger ADD CONSTRAINT fk_wallet_ledger_withdrawal_request
      FOREIGN KEY (withdrawal_request_id) REFERENCES withdrawal_requests(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ---------------------------------------------------------------------
-- Taxas configuráveis + métodos de pagamento aceitos (store_settings já
-- é o singleton de configuração da loja — reaproveita o mesmo padrão)
-- ---------------------------------------------------------------------

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_fixed NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_markup_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_markup_fixed NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepts_pix BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS accepts_credit_card BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accepts_boleto BOOLEAN NOT NULL DEFAULT FALSE;
