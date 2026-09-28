-- Central de notificações do cliente: avisos da loja (anúncios), mudanças
-- de status de pedido (pago/cancelado/reembolsado/etc — complementa o
-- email, não substitui) e convites de revendedor (aceitar/recusar fica
-- aqui, não é mais autocandidatura). `data` guarda o payload estruturado
-- específico de cada tipo (ex: order_id, reseller_id) pra a UI decidir o
-- que fazer sem precisar re-parsear o título.
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- announcement | order_update | reseller_invite
  title TEXT NOT NULL,
  body TEXT,
  data JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
