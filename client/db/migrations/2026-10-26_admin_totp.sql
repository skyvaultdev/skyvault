-- 2FA (TOTP) opcional por conta de staff — cada um ativa o próprio, não é
-- forçado. totp_secret só vira "de verdade" quando totp_enabled = true
-- (um secret gerado mas nunca confirmado não é usado pra nada).
ALTER TABLE admin ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE admin ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
