-- =====================================================================
-- Item 4 do plano de segurança (Fase 4): data_subject_requests e
-- wishlist_items foram criadas (2026-10-26_*) DEPOIS da fase 2 de
-- multi-tenant e ficaram de fora — sem store_id, sem RLS. Hoje isso não é
-- explorável (toda rota que as toca faz JOIN com users, que já tem RLS, e
-- uma linha de outra loja simplesmente não aparece no JOIN), mas é uma
-- inconsistência com o padrão do resto do schema (~45 tabelas) e um risco
-- real pra qualquer rota NOVA que um dia faça `SELECT ... WHERE id = $1`
-- direto nessas tabelas sem passar pelo JOIN.
--
-- Mesma receita de db/migrations/2026-09-25_multi_tenant_phase2.sql:
-- store_id backfilled via JOIN com users (dono da linha), DEFAULT ligado
-- à conexão (app.store_id), RLS forçada (até o dono da tabela precisa do
-- contexto certo pra enxergar a linha).
-- =====================================================================

BEGIN;

ALTER TABLE data_subject_requests ADD COLUMN IF NOT EXISTS store_id INTEGER;
UPDATE data_subject_requests dsr
  SET store_id = u.store_id
  FROM users u
  WHERE u.id = dsr.user_id AND dsr.store_id IS NULL;
ALTER TABLE data_subject_requests ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE data_subject_requests
  ALTER COLUMN store_id SET DEFAULT NULLIF(current_setting('app.store_id', true), '')::integer;
ALTER TABLE data_subject_requests
  DROP CONSTRAINT IF EXISTS data_subject_requests_store_id_fkey;
ALTER TABLE data_subject_requests
  ADD CONSTRAINT data_subject_requests_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT;
ALTER TABLE data_subject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_subject_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON data_subject_requests;
CREATE POLICY tenant_isolation ON data_subject_requests
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::integer)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::integer);

ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS store_id INTEGER;
UPDATE wishlist_items wi
  SET store_id = u.store_id
  FROM users u
  WHERE u.id = wi.user_id AND wi.store_id IS NULL;
ALTER TABLE wishlist_items ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE wishlist_items
  ALTER COLUMN store_id SET DEFAULT NULLIF(current_setting('app.store_id', true), '')::integer;
ALTER TABLE wishlist_items
  DROP CONSTRAINT IF EXISTS wishlist_items_store_id_fkey;
ALTER TABLE wishlist_items
  ADD CONSTRAINT wishlist_items_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wishlist_items;
CREATE POLICY tenant_isolation ON wishlist_items
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::integer)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::integer);

COMMIT;

-- Rollback:
-- BEGIN;
-- ALTER TABLE data_subject_requests DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS tenant_isolation ON data_subject_requests;
-- ALTER TABLE data_subject_requests DROP CONSTRAINT IF EXISTS data_subject_requests_store_id_fkey;
-- ALTER TABLE data_subject_requests DROP COLUMN IF EXISTS store_id;
-- ALTER TABLE wishlist_items DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS tenant_isolation ON wishlist_items;
-- ALTER TABLE wishlist_items DROP CONSTRAINT IF EXISTS wishlist_items_store_id_fkey;
-- ALTER TABLE wishlist_items DROP COLUMN IF EXISTS store_id;
-- COMMIT;
