-- Item B1a da revisão de segurança (de4d5eb em diante): discuser.access_token/
-- refresh_token/expires_in e googleuser.access_token/refresh_token/expires_in
-- nunca são lidos de volta do banco em nenhum lugar do código — são usados
-- em memória, na hora do login, só pra buscar o perfil (discord.com/api/v10/
-- users/@me, googleapis.com/.../userinfo), e DEPOIS disso cifrados e gravados
-- sem necessidade nenhuma. Em vez de rotacionar a chave que os protegia,
-- paramos de guardar esse dado.
--
-- ORDEM DE APLICAÇÃO: esta migração precisa rodar ANTES (ou junto, na mesma
-- janela de deploy) do código que para de gravar esses campos — sem o DROP
-- NOT NULL abaixo, o INSERT em discuser quebra assim que o app parar de
-- mandar um valor real pra access_token/refresh_token/expires_in (hoje são
-- NOT NULL nessa tabela; em googleuser já eram nullable).
--
-- Idempotente: pode rodar de novo sem erro (DROP NOT NULL num campo já
-- nullable não falha; zerar uma coluna já NULL também não).

ALTER TABLE discuser ALTER COLUMN access_token DROP NOT NULL;
ALTER TABLE discuser ALTER COLUMN refresh_token DROP NOT NULL;
ALTER TABLE discuser ALTER COLUMN expires_in DROP NOT NULL;

-- Backfill: zera o que já foi gravado (apaga os tokens históricos, nunca
-- usados). DML passa por RLS — itera todas as lojas que existirem, não só
-- a loja 1, pra cobrir qualquer ambiente multi-loja real.
DO $$
DECLARE s RECORD;
BEGIN
  FOR s IN SELECT id FROM stores LOOP
    PERFORM set_config('app.store_id', s.id::text, false);
    UPDATE discuser SET access_token = NULL, refresh_token = NULL, expires_in = NULL
      WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL OR expires_in IS NOT NULL;
    UPDATE googleuser SET access_token = NULL, refresh_token = NULL, expires_in = NULL
      WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL OR expires_in IS NOT NULL;
  END LOOP;
END $$;

-- Rollback (coluna volta a exigir valor — só reversível se não houver linha
-- com o campo NULL; não há como "recuperar" o token apagado, só impedir
-- novo INSERT sem ele):
--   ALTER TABLE discuser ALTER COLUMN access_token SET NOT NULL;
--   ALTER TABLE discuser ALTER COLUMN refresh_token SET NOT NULL;
--   ALTER TABLE discuser ALTER COLUMN expires_in SET NOT NULL;
