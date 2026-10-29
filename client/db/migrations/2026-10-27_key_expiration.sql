-- Validade opcional para produtos digitais do tipo "key" (licenças/chaves).
-- Sem cobrança recorrente automática — é só uma data informativa: quando o
-- staff configura "validade em dias" no produto, cada chave vendida grava
-- quando ela vence; isso aparece pro cliente (email de entrega + pedido) e
-- pro staff (aviso de chaves vencendo em breve).
ALTER TABLE products ADD COLUMN IF NOT EXISTS key_validity_days INTEGER;
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS key_validity_days INTEGER;
ALTER TABLE stock_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
