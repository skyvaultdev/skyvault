# Backup e restore do Postgres

Item 10 do plano de segurança. Não é código do app — é infraestrutura —
mas o script (`scripts/backup/pg_backup.sh`) e este procedimento foram
**testados de verdade** contra o banco de dev antes de escrever qualquer
coisa aqui (ver seção "O que foi testado" no final).

## ⚠️ Achado real: o usuário normal do app (`app_user`) NÃO PODE fazer backup

Testei `pg_dump` usando exatamente as credenciais que o app usa
(`DB_USER`/`DB_PASSWORD` de `.env.local`) e o dump **falhou no meio**,
com `pg_dump` escrevendo um arquivo `.dump` truncado/incompleto no disco
antes de abortar:

```
pg_dump: error: consulta falhou: ERRO:  query would be affected by row-level security policy for table "admin"
DICA:  To disable the policy for the table's owner, use ALTER TABLE NO FORCE ROW LEVEL SECURITY.
```

Causa: as ~45 tabelas multi-tenant deste projeto usam
`FORCE ROW LEVEL SECURITY` (ver `db/migrations/2026-09-25_multi_tenant_phase2.sql`)
— isso bloqueia a leitura até do DONO da tabela, a menos que a role tenha
o atributo `BYPASSRLS` ou seja superusuário. `app_user` não tem nenhum
dos dois (confirmado: `rolsuper=false`, `rolbypassrls=false`).

**Isso significa que rodar o backup com as credenciais normais do app
produz um arquivo de backup CORROMPIDO/INCOMPLETO, sem nenhum erro óbvio
pra quem só olhar "o cron rodou, criou um arquivo .dump" — o problema só
apareceria no dia em que alguém precisasse restaurar de verdade.**

### A correção: uma role dedicada só pra backup, com `BYPASSRLS`

Nunca use a senha do `postgres` (superusuário) num cron job de rotina —
siga o princípio de menor privilégio: crie uma role separada, só com
permissão de leitura + `BYPASSRLS`, feita só pra isso. Rode isto uma vez,
como superusuário (`postgres`), contra o banco de produção:

```sql
CREATE ROLE pg_backup WITH LOGIN BYPASSRLS PASSWORD 'troque-por-um-valor-aleatorio-forte';
GRANT CONNECT ON DATABASE skybase TO pg_backup;
GRANT USAGE ON SCHEMA public TO pg_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pg_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO pg_backup;
```

Use essa role (não `app_user`, não `postgres`) nas env vars do script de
backup.

## O script: `scripts/backup/pg_backup.sh`

```bash
DB_HOST=... DB_PORT=5432 DB_USER=pg_backup DB_NAME=skybase DB_PASSWORD=... \
BACKUP_DIR=/var/backups/skybase BACKUP_RETENTION_DAYS=14 \
  ./scripts/backup/pg_backup.sh
```

- `--format=custom` (`-Fc`): formato comprimido, permite restore seletivo
  (uma tabela só, por exemplo) — ao contrário de um dump em texto puro.
- Nome do arquivo com timestamp UTC: `${DB_NAME}_${TIMESTAMP}.dump`.
- Retenção: apaga sozinho, no fim de cada execução, qualquer arquivo
  `${DB_NAME}_*.dump` em `BACKUP_DIR` com mais de `BACKUP_RETENTION_DAYS`
  dias (14 por padrão) — nunca mexe em outro arquivo da mesma pasta.
- `DB_PASSWORD` vai via `PGPASSWORD` (lido pelo próprio `pg_dump`), nunca
  como argumento de linha de comando — argumento de processo fica visível
  pra qualquer outro usuário do mesmo host.

## Agendamento (cron)

```cron
# Todo dia às 3h da manhã (horário do servidor)
0 3 * * * DB_HOST=... DB_PORT=5432 DB_USER=pg_backup DB_NAME=skybase DB_PASSWORD=... BACKUP_DIR=/var/backups/skybase /caminho/pra/repo/client/scripts/backup/pg_backup.sh >> /var/log/pg_backup.log 2>&1
```

Garanta que `BACKUP_DIR` fica num disco/volume **separado** do banco em
si (ou, melhor, é sincronizado pra fora do servidor — S3, outro host) —
um backup que mora no mesmo disco que pode corromper/falhar junto com o
banco não protege contra o cenário mais comum de perda de dado (disco
morrendo).

## Procedimento de restore

```bash
# 1. Cria um banco novo e vazio pra restaurar (NUNCA restaure --clean
#    direto em cima do banco de produção ainda rodando — crie um banco
#    novo, confira que o restore deu certo, e só então troque o app pra
#    apontar pra ele).
createdb --host=<host> --username=<role-com-createdb> skybase_restore_test

# 2. Restaura o dump
pg_restore --host=<host> --username=<role-com-createdb-e-bypassrls> \
  --dbname=skybase_restore_test --no-owner --no-privileges \
  /caminho/pro/skybase_20261029T030000Z.dump

# 3. Confere: conta linhas de uma tabela que você sabe quantas linhas
#    tinha no momento do backup (ex: orders, users) e compara.
psql --host=<host> --username=<role> --dbname=skybase_restore_test \
  -c "SELECT count(*) FROM orders;"
```

Depois de confirmar que o restore está íntegro, promova
`skybase_restore_test` (renomeie, ou aponte `DB_NAME` pra ele) — nunca
pule a etapa 1/3 restaurando `--clean` direto em cima do banco real.

## O que foi testado (e o que não deu pra testar neste ambiente)

Testado de verdade, contra o Postgres de desenvolvimento deste projeto:

- ✅ `pg_dump --schema-only` com as credenciais normais do app — funciona
  (RLS só afeta leitura de LINHA, não a estrutura das tabelas).
- ✅ `pg_dump` completo (dados) com as credenciais normais do app (`app_user`)
  — **falha**, exatamente como descrito acima. Esse é o achado real que
  motivou a seção de `BYPASSRLS` acima.
- ❌ `createdb`/`pg_restore` ponta a ponta — **não deu pra testar neste
  ambiente**: a única credencial disponível (`app_user`) também não tem
  `CREATEDB`, e não havia uma credencial de superusuário disponível pra
  criar uma role de backup de teste sem mexer em infraestrutura real. Os
  comandos de restore acima seguem a sintaxe padrão/documentada do
  `pg_restore` (não são inventados), mas **o primeiro restore de verdade
  em produção deve ser tratado como um treino/drill**, não só confiar
  cegamente nesta documentação.

