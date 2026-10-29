-- Registro de quando o COMPRADOR aceitou os Termos de Uso/Privacidade da
-- loja ao finalizar a compra (checkbox obrigatório no checkout) — prova
-- de consentimento por pedido, igual já existe pro OWNER aceitar o
-- contrato da plataforma (store_settings.platform_terms_accepted_at).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
