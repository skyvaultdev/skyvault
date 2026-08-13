-- =====================================================================
-- Dashboard exclusiva pra devs: usuários de dev (auth totalmente
-- separada da loja), bloqueio individual de owner/admin/editor, e
-- kill-switch geral da loja.
-- =====================================================================

CREATE TABLE IF NOT EXISTS dev_users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin
  ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- Quem aprova/rejeita/marca como pago um saque agora é um dev, não mais
-- o dono da loja — processed_by_admin_id (referência a `admin`) não serve
-- mais pra isso, precisa apontar pra dev_users.
ALTER TABLE withdrawal_requests
  ADD COLUMN IF NOT EXISTS processed_by_dev_id BIGINT REFERENCES dev_users(id) ON DELETE SET NULL;
