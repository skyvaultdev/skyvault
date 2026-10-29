-- Item da Fase 5 (busca pública paginada): índice de trigram pra acelerar
-- ILIKE '%termo%' em nome/descrição de produto — sem isso, um ILIKE com
-- curinga nos dois lados nunca usa índice normal (btree), sempre faz
-- sequential scan. Puramente uma otimização de performance: a busca já
-- funciona corretamente com ILIKE simples sem este índice (só mais lenta
-- em catálogos grandes), então NÃO bloqueia a funcionalidade enquanto
-- não for aplicado.
--
-- Aplicado no banco de dev desta sessão (2026-10-29), como superuser.
-- CREATE EXTENSION exige um role com privilégio de superusuário, OU
-- `GRANT CREATE ON DATABASE <nome_do_banco> TO app_user;` rodado uma vez
-- como superuser (pg_trgm é uma extensão "trusted" — depois desse GRANT,
-- app_user consegue criar ela sozinho, sem precisar de superuser de novo).
-- Rollback do GRANT: `REVOKE CREATE ON DATABASE <nome_do_banco> FROM app_user;`
--
-- Item C3 (revisão de segurança): bloco condicional — em ambientes onde
-- quem roda isto NÃO tem privilégio (nem o GRANT acima foi feito), avisa
-- em vez de abortar a migração inteira; os índices ficam pra quando
-- alguém com privilégio rodar este arquivo de novo.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'pg_trgm não pôde ser criada (privilégio insuficiente) — índices de busca NÃO foram criados agora. Rode como superuser (ou com o GRANT documentado acima) depois.';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON products USING gin (description gin_trgm_ops);
  END IF;
END $$;

-- Rollback:
-- DROP INDEX IF EXISTS idx_products_name_trgm;
-- DROP INDEX IF EXISTS idx_products_description_trgm;
-- DROP EXTENSION IF EXISTS pg_trgm;
