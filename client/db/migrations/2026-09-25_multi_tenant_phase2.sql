-- =====================================================================
-- MULTI-TENANT — FASE 2 (NÃO rode antes do código estar pronto!)
--
-- Pré-requisitos (ver checklist no final):
--   * toda query do app já filtra/insere store_id, e as conexões fazem
--     `SET LOCAL app.store_id = <id>` no início de cada request/transação;
--   * o usuário do banco usado pelo app NÃO é superuser nem tem BYPASSRLS
--     (superuser ignora RLS). Rode 2026-09-25_multi_tenant_phase2b_app_role.sql
--     e troque DB_USER/DB_PASSWORD no .env por esse role;
--   * jobs de plataforma (/dev, webhooks que ainda não sabem a loja) usam
--     outro role com BYPASSRLS.
--
-- Efeito: troca o DEFAULT 1 pelo DEFAULT da conexão (app.store_id) — os
-- INSERTs do app continuam sem informar store_id — e liga Row Level Security: sem `app.store_id` definido, a
-- query enxerga ZERO linhas — falha fechada.
--
-- `stores` fica SEM RLS de propósito (é consultada pelo Host antes de
-- existir tenant).
-- =====================================================================

BEGIN;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'store_id' AND c.table_name <> 'stores'
  LOOP
    -- O DEFAULT deixa de ser a loja 1 e passa a ser a loja da conexão
    -- (app.store_id, definido pelo tenantPool). Sem contexto vira NULL e o
    -- INSERT falha (NOT NULL) em vez de cair na loja errada.
    EXECUTE format('ALTER TABLE %I ALTER COLUMN store_id SET DEFAULT NULLIF(current_setting(''app.store_id'', true), '''')::integer', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      $p$CREATE POLICY tenant_isolation ON %I
         USING (store_id = NULLIF(current_setting('app.store_id', true), '')::integer)
         WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::integer)$p$, t);
  END LOOP;
END $$;

COMMIT;

-- =====================================================================
-- CHECKLIST DE CÓDIGO (o que mudar no app antes desta fase)
-- =====================================================================
-- 1. FEITO — lib/tenant/tenantContext.ts resolve Host -> stores.id (cache 60s);
--    defina ROOT_DOMAIN no .env para ligar o modo multi-loja.
-- 2. FEITO — lib/database/tenantPool.ts: getDB() liga app.store_id em toda conexão.
-- 3. FEITO — JWT com claim `sid` (lib/jwt/storeAware.ts rejeita token de outra
--    loja). Mantenha cookies host-only (sem Domain=.raiz).
-- 4. Todos os ensure*() (team.ts, ensureQuestionsTable, ensureReviewsTable,
--    ensureResellerTables, ensureNotificationsTable, promotionSettings,
--    stockMovements, deliveryFailures, store-settings/route.ts...) criam
--    tabelas SEM store_id: passar a criar com store_id NOT NULL REFERENCES
--    stores(id) e com as UNIQUEs por loja acima — senão recriam o schema errado.
-- 5. Credenciais por loja: Mercado Pago sai do .env para mercadopago_credentials
--    (criptografada, por store_id); webhook precisa achar a loja pelo
--    payment_ref/rota /api/webhooks/mercadopago/<storeId> e validar o segredo
--    daquela loja. Melhor Envio idem. chat_encryption_key sai de store_settings
--    para uma chave por loja.
-- 6. Login social: Google/Discord não aceitam redirect com curinga de
--    subdomínio — usar um domínio central de auth com a loja no `state`.
-- 7. Arquivos: prefixar uploads/private/stock com /<storeId>/ e validar a
--    loja em /api/files.
-- 8. Rate limit, caches em memória e chaves de SSE: incluir store_id na chave.
-- 9. Legado sem uso (não migrado): wallet_ledger, withdrawal_requests, banners.
-- =====================================================================
