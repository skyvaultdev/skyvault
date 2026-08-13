-- =====================================================================
-- CEP de origem da loja — necessário pra cotar frete real (Melhor Envio
-- exige from.postal_code). Idempotente.
-- =====================================================================

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS origin_cep TEXT;
