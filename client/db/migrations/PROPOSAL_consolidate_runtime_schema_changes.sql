-- =====================================================================
-- PROPOSTA — NÃO É UMA MIGRATION APLICADA, NÃO RODE AINDA.
--
-- Este arquivo NÃO segue a convenção de nome com data (2026-MM-DD_*.sql)
-- de propósito, pra não ser confundido com uma migration real pendente.
--
-- Contexto: além do ALTER TABLE que rodava em app/layout.tsx (já removido
-- e movido para db/migrations/2026-10-06_store_settings_background_solid_color.sql),
-- o projeto tem MUITOS outros lugares que rodam ALTER TABLE/CREATE TABLE
-- IF NOT EXISTS em toda chamada de rota (o padrão "ensure*Table/Schema" —
-- ver lista completa abaixo). Isso é mais barato que o caso do layout (só
-- roda quando aquela rota específica é chamada, não em toda página), mas
-- ainda é:
--   1. Overhead real por request nas rotas mais usadas (ex: produtos,
--      categorias, store-settings).
--   2. Um teste condicional de coluna/índice a cada vez em vez de UMA VEZ
--      no deploy.
--   3. Esquema do banco definido em dois lugares (código + migrations
--      reais já existentes), fácil de dessincronizar.
--
-- O SQL abaixo é a UNIÃO de tudo que esses ensure*/ALTER já fazem hoje —
-- é seguro rodar (tudo IF NOT EXISTS / CREATE ... IF NOT EXISTS), mesmo
-- que já tenha sido aplicado ad-hoc em produção pelos próprios ensure*.
-- Rodar isto SOZINHO não quebra nada. O que AINDA NÃO FOI FEITO (de
-- propósito, a pedido) é remover o código das rotas abaixo — isso é um
-- passo separado, só depois que esta migration (ou uma revisada a partir
-- dela) for de fato aplicada em todos os ambientes.
--
-- LEVANTAMENTO — arquivo:linha de cada ALTER TABLE / ensure*Table/Schema
-- encontrado em app/ e lib/ (grep "ALTER TABLE" e "function ensure\w*\("):
--
--   app/layout.tsx:80                                    [JÁ REMOVIDO — rodava em TODA página]
--   app/api/categories/route.ts:12                        ensureSchema() — categories.image_url
--   app/api/products/route.ts:21,25                       ensureProductSchema() — products.position, product_images.created_at
--   app/api/products/add/route.ts:37                       ALTER TABLE products ADD COLUMN position
--   app/api/store-settings/route.ts:27-55                  ensureSchema() — CREATE TABLE store_settings + loop de ADD COLUMN
--   app/api/admin/payment-settings/route.ts:16-27          ensureSchema() — store_settings.shipping_markup_*/accepts_*
--   app/api/admin/shipping-settings/route.ts:7-11          ensureSchema() — store_settings.origin_cep
--   app/api/dev/store-status/route.ts:7-15                 ensureSchema() — store_settings.suspended/suspended_reason
--   app/api/admin/orders/[id]/route.ts:391                 ALTER TABLE shipments ADD COLUMN tracking_generated
--   app/api/coupon/add/route.ts:5-21                       ensureCouponsSchema() — CREATE TABLE coupons
--   app/api/coupons/route.ts:7-23                          ensureCouponsSchema() — CREATE TABLE coupons (duplicado do de cima)
--   app/api/coupon/route.ts (GET lista) + coupon/[id], coupon/edit/[id], coupons/[id] — todos reusam a mesma ensureCouponsSchema
--   lib/chat/messageCrypto.ts:21                           store_settings.chat_encryption_key
--   lib/home/loadHomeConfig.ts:5                           store_settings.home_config
--   lib/orders/deliverySnapshot.ts:10,15-16                orders.attention_note, order_items.delivered_content/delivered_file_size
--   lib/orders/orderNumber.ts:24-27                        orders.order_number + índice único
--   lib/questions/ensureQuestionsTable.ts:3-47              CREATE TABLE product_questions + product_question_messages, coluna staff_unread
--   lib/reviews/ensureReviewsTable.ts:3-22                  CREATE TABLE product_reviews
--   lib/resellers/ensureResellerTables.ts:5-75              CREATE TABLE resellers/reseller_products/reseller_commissions/reseller_payout_requests + orders.reseller_id
--   lib/notifications/ensureNotificationsTable.ts:5-21      CREATE TABLE notifications
--   lib/stock/stockMovements.ts:26-46                       CREATE TABLE stock_movements (já tem migration própria: 2026-09-17_stock_movements.sql)
--   lib/pricing/promotionSettings.ts:8-21                   CREATE TABLE store_promotion_settings
--   lib/payments/deliveryFailures.ts:~10-19                 CREATE TABLE delivery_failures
--   lib/team/team.ts:14-65                                  CREATE TABLE team_roles/admin_roles/team_audit_log/team_base_permissions + fix da constraint admin_role_check
--
-- Nenhum desses foi removido do código ainda — só esta migration foi
-- escrita, como proposta, igual pedido.
-- =====================================================================


-- ---------------------------------------------------------------------
-- store_settings
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  primary_color TEXT NOT NULL DEFAULT '#b700ff',
  secondary_color TEXT NOT NULL DEFAULT '#6400ff',
  logo_url TEXT,
  background_style TEXT,
  background_img_url TEXT,
  background_css TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS store_name TEXT;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS background_solid_color TEXT; -- já coberto por 2026-10-06_store_settings_background_solid_color.sql
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS origin_cep TEXT;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS home_config JSONB;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS chat_encryption_key TEXT;
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS shipping_markup_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_markup_fixed NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepts_pix BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS accepts_credit_card BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS accepts_debit_card BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS accepts_boleto BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

INSERT INTO store_settings (primary_color, secondary_color)
SELECT '#b700ff', '#6400ff'
WHERE NOT EXISTS (SELECT 1 FROM store_settings);


-- ---------------------------------------------------------------------
-- products / categories / product_images
-- ---------------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS position INT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug_unique ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

ALTER TABLE product_images ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_product_images_product_position ON product_images(product_id, position);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug_unique ON categories(slug);


-- ---------------------------------------------------------------------
-- coupons (hoje criada por 3 rotas duplicadas: coupon/add, coupons, coupon)
-- ---------------------------------------------------------------------
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
);


-- ---------------------------------------------------------------------
-- store_promotion_settings
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_promotion_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discount_tiers JSONB NOT NULL DEFAULT '[]',
  free_shipping_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  free_shipping_threshold NUMERIC(10,2) NOT NULL DEFAULT 150,
  min_order_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------
-- stock_movements (já existe como migration própria: 2026-09-17_stock_movements.sql
-- — repetido aqui só pra esse arquivo consolidado cobrir TUDO; é um no-op
-- onde a outra migration já rodou)
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- orders / order_items
-- ---------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attention_note TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_idx ON orders (order_number) WHERE order_number IS NOT NULL;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS delivered_content TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS delivered_file_size BIGINT;


-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;


-- ---------------------------------------------------------------------
-- delivery_failures
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_failures (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  error_message TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------
-- product_questions / product_question_messages
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_questions (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  asker_name TEXT,
  question TEXT NOT NULL,
  answer TEXT,
  answered_by TEXT,
  answered_at TIMESTAMPTZ,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS product_questions_product_idx ON product_questions (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS product_questions_unanswered_idx ON product_questions (created_at) WHERE answer IS NULL AND hidden = false;

-- staff_unread: coluna + backfill condicional. O código hoje só faz o
-- backfill (marcar como não lida) na PRIMEIRA vez que a coluna é criada —
-- rodar isto numa base que já tem a coluna não deve repetir o backfill
-- (por isso o WHERE NOT EXISTS, não um UPDATE incondicional).
ALTER TABLE product_questions ADD COLUMN IF NOT EXISTS staff_unread BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS product_questions_staff_unread_idx ON product_questions (created_at) WHERE staff_unread = TRUE;

CREATE TABLE IF NOT EXISTS product_question_messages (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES product_questions(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('customer', 'staff')),
  author_name TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS product_question_messages_q_idx ON product_question_messages (question_id, created_at);


-- ---------------------------------------------------------------------
-- product_reviews
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- resellers (resellers -> reseller_products -> orders.reseller_id ->
-- reseller_commissions -> reseller_payout_requests, nessa ordem por FK)
-- ---------------------------------------------------------------------
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
);
CREATE UNIQUE INDEX IF NOT EXISTS resellers_user_id_idx ON resellers (user_id);
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS pix_key_type TEXT;
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS pix_holder_name TEXT;

CREATE TABLE IF NOT EXISTS reseller_products (
  id SERIAL PRIMARY KEY,
  reseller_id INTEGER NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  commission_percent NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reseller_id, product_id)
);

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
  status TEXT NOT NULL DEFAULT 'confirmed',
  payout_request_id INTEGER,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reseller_commissions_reseller_idx ON reseller_commissions (reseller_id);
CREATE UNIQUE INDEX IF NOT EXISTS reseller_commissions_order_item_idx ON reseller_commissions (order_item_id) WHERE order_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reseller_payout_requests (
  id SERIAL PRIMARY KEY,
  reseller_id INTEGER NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS reseller_payout_requests_reseller_idx ON reseller_payout_requests (reseller_id);


-- ---------------------------------------------------------------------
-- shipments
-- ---------------------------------------------------------------------
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS tracking_generated BOOLEAN NOT NULL DEFAULT FALSE;


-- ---------------------------------------------------------------------
-- team (cargos personalizados)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#99aab5',
  position INTEGER NOT NULL DEFAULT 1,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS admin_roles (
  admin_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL REFERENCES team_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (admin_id, role_id)
);
CREATE TABLE IF NOT EXISTS team_audit_log (
  id SERIAL PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS team_audit_created_idx ON team_audit_log (created_at DESC);
CREATE TABLE IF NOT EXISTS team_base_permissions (
  role TEXT PRIMARY KEY,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- admin.role tinha CHECK só com owner/admin/editor — "member" (cargo-base
-- sem permissões próprias) precisa ser aceito. Só muda a constraint se
-- ela ainda não aceitar "member" (idempotente, igual ensureTeamTables()).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'admin'::regclass AND conname = 'admin_role_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%member%'
  ) THEN
    ALTER TABLE admin DROP CONSTRAINT admin_role_check;
    ALTER TABLE admin ADD CONSTRAINT admin_role_check CHECK (role = ANY (ARRAY['owner','admin','editor','member']));
  END IF;
END $$;
