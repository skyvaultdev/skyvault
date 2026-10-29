-- Item da Fase 5 (busca pública paginada): índice de trigram pra acelerar
-- ILIKE '%termo%' em nome/descrição de produto — sem isso, um ILIKE com
-- curinga nos dois lados nunca usa índice normal (btree), sempre faz
-- sequential scan. Puramente uma otimização de performance: a busca já
-- funciona corretamente com ILIKE simples sem este índice (só mais lenta
-- em catálogos grandes), então NÃO bloqueia a funcionalidade enquanto
-- não for aplicado.
--
-- NÃO testado contra o banco de dev desta tarefa: CREATE EXTENSION exige
-- um role com privilégio de superusuário (ou CREATE explícito na extensão),
-- que não estava disponível no ambiente usado pra implementar isso — só
-- app_user, sem esse privilégio (mesma limitação encontrada no item do
-- backup do Postgres). Aplique isso com um role privilegiado.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON products USING gin (description gin_trgm_ops);

-- Rollback:
-- DROP INDEX IF EXISTS idx_products_name_trgm;
-- DROP INDEX IF EXISTS idx_products_description_trgm;
-- DROP EXTENSION IF EXISTS pg_trgm;
