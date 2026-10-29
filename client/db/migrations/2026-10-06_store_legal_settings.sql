-- Dados legais do lojista (exibidos no rodapé da loja e exigidos antes de
-- vender — ver app/api/checkout/create-order/route.ts) + as 3 políticas
-- editáveis pelo dashboard (app/(private)/dashboard/components/LegalSettingsPanel.tsx)
-- + o registro de aceite do contrato da plataforma pelo owner.
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS document TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS privacy_policy TEXT,
  ADD COLUMN IF NOT EXISTS returns_policy TEXT,
  ADD COLUMN IF NOT EXISTS store_terms TEXT,
  ADD COLUMN IF NOT EXISTS platform_terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_terms_version TEXT,
  ADD COLUMN IF NOT EXISTS platform_terms_accepted_by TEXT;
