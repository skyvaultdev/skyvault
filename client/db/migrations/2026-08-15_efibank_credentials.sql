-- =====================================================================
-- Credenciais da EfiBank do dono da loja — configuráveis pelo dashboard
-- (aba Configurações), não por env var: quem recebe o pagamento é o
-- dono da loja, não a plataforma. client_secret, senha do certificado e
-- o certificado .p12 em si ficam criptografados (AES-256-GCM, mesma
-- função já usada pra token de sessão em lib/security/tokenCrypto.ts) —
-- nunca gravados em texto puro.
-- =====================================================================

CREATE TABLE IF NOT EXISTS efibank_credentials (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT,
  client_secret_encrypted TEXT,
  cert_data_encrypted TEXT,
  cert_filename TEXT,
  cert_password_encrypted TEXT,
  pix_key TEXT,
  sandbox BOOLEAN NOT NULL DEFAULT TRUE,
  webhook_registered_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
