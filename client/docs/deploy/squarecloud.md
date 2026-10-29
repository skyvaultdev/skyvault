# Deploy na Square Cloud

Container Node único (`squarecloud.app` — `RUNTIME=nodejs`, `MEMORY=1024`,
`START=npm run start`), Postgres 17 e Redis 8 gerenciados pela própria
Square Cloud, os dois só aceitando TLS com certificado de cliente.

Banco ainda não existe — **nasce vazio, a partir de `db/migrations/DB_atual.sql`**.
Não é um deploy incremental sobre produção existente.

> ⚠️ Nada neste documento foi testado contra a Square Cloud de verdade
> neste ambiente (sem conta/acesso disponível aqui). Os nomes de campo do
> `squarecloud.app` (`RUNTIME`, `VERSION`, `MEMORY`, `START`) seguem
> exatamente o que foi especificado; qualquer outro detalhe da
> plataforma (fluxo exato de criação do banco, onde baixar os
> certificados TLS, se `MAIN` é obrigatório) precisa ser conferido contra
> a documentação atual deles no momento do deploy — trate os passos "via
> painel da Square Cloud" abaixo como o que fazer, não como a localização
> exata de cada botão.

## Ordem

1. [Criar o banco Postgres gerenciado](#1-criar-o-banco-postgres-gerenciado)
2. [Rodar `DB_atual.sql`](#2-rodar-db_atualsql)
3. [Confirmar `pg_trgm`](#3-confirmar-pg_trgm)
4. [Configurar as variáveis de ambiente](#4-variáveis-de-ambiente)
5. [Deploy](#5-deploy)
6. [Testes pós-deploy](#6-testes-pós-deploy)
7. [Promover report → enforce](#7-promover-report--enforce)

---

## 1. Criar o banco Postgres gerenciado

Pelo painel da Square Cloud, crie a instância de **Postgres 17**. Isso
deve te dar: host, porta, um usuário administrador (superuser ou
equivalente) e os 3 arquivos do certificado TLS mútuo (CA, certificado de
cliente, chave de cliente — nomes variam por provedor, procure algo como
`ca.pem`/`client-cert.pem`/`client-key.pem`).

Converta os 3 pra base64 (conteúdo inteiro numa linha só — é assim que as
env vars `DB_SSL_*_BASE64` esperam):

```bash
# Linux/Mac
base64 -w0 ca.pem > ca.b64
base64 -w0 client-cert.pem > cert.b64
base64 -w0 client-key.pem > key.b64
```

```powershell
# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("ca.pem")) | Out-File ca.b64 -NoNewline
[Convert]::ToBase64String([IO.File]::ReadAllBytes("client-cert.pem")) | Out-File cert.b64 -NoNewline
[Convert]::ToBase64String([IO.File]::ReadAllBytes("client-key.pem")) | Out-File key.b64 -NoNewline
```

Guarde o conteúdo desses 3 arquivos `.b64` — vai pras env vars
`DB_SSL_CA_BASE64`/`DB_SSL_CERT_BASE64`/`DB_SSL_KEY_BASE64` no passo 4.
**Não** commite nem deixe esses arquivos no diretório de deploy.

## 2. Rodar `DB_atual.sql`

Com o **usuário administrador** do banco (precisa de privilégio pra
`CREATE EXTENSION`/`CREATE ROLE` — ver cabeçalho do próprio arquivo):

```bash
psql "host=<host> port=<porta> dbname=<banco> user=<admin> sslmode=verify-full sslrootcert=ca.pem sslcert=client-cert.pem sslkey=client-key.pem" \
  -v ON_ERROR_STOP=1 -f db/migrations/DB_atual.sql
```

Isso cria **todo** o schema (tabelas, RLS, policies, triggers, funções) e,
no final, o role `app_user` — com a senha placeholder `TROQUE-ESTA-SENHA`.
Troque AGORA, antes de mais nada, direto no banco (evita deixar a senha
real num arquivo em disco):

```sql
ALTER ROLE app_user WITH PASSWORD '<senha forte e única, gerada agora>';
```

Essa é a senha que vai em `DB_PASSWORD` no passo 4 — `DB_USER=app_user`,
nunca o usuário administrador (ele tem privilégio demais; `app_user` é o
role sem `SUPERUSER`/`BYPASSRLS`, dono das tabelas, que faz a RLS valer —
ver seção [RLS](#rls-o-que-já-está-garantido) abaixo).

## 3. Confirmar `pg_trgm`

O bloco de `DB_atual.sql` já tenta criar a extensão sozinho (rodando como
o admin do passo 2, deve funcionar direto). Confirme:

```sql
SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';
SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_products_name_trgm', 'idx_products_description_trgm');
```

Se a extensão não aparecer (RAISE WARNING no passo 2 avisaria), rode como
admin:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON products USING gin (description gin_trgm_ops);
```

## RLS — o que já está garantido

As tabelas usam `FORCE ROW LEVEL SECURITY` (não só `ENABLE`) — isso é o
que faz a RLS valer **mesmo pro dono** da tabela, não só pra roles sem
privilégio. `app_user` (criado no passo 2) É o dono das tabelas
(necessário pros `ensure*()` do app rodarem `ALTER TABLE ... IF NOT
EXISTS` em runtime) **e** não é superuser nem tem `BYPASSRLS` — as duas
condições precisam estar certas ao mesmo tempo, e as duas já saem prontas
do `DB_atual.sql`. Confirmado no banco de dev desta sessão:

```
app_user: rolsuper=false, rolbypassrls=false
dono de orders/users/etc: app_user
orders: relrowsecurity=true, relforcerowsecurity=true
```

**Não conecte o app com o usuário administrador do passo 1** — ele é
superuser (ou teria `BYPASSRLS`), e isso faz a RLS ser **ignorada por
completo**, mesmo com `FORCE` ligado. Sempre `DB_USER=app_user` em
produção.

## 4. Variáveis de ambiente

Configure tudo isto no painel de variáveis de ambiente da Square Cloud —
**nada disto vai no zip** (ver `scripts/deploy/build_and_zip.sh`).

### Precisam de valor NOVO (nunca reuse o que está no seu `.env.local` de dev)

| Variável | Como gerar |
|---|---|
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `DEV_JWT_SECRET` | mesmo comando |
| `INTERNAL_API_SECRET` | mesmo comando |
| `INTERNAL_ORCHESTRATOR_TOKEN` | mesmo comando (nunca igual ao `INTERNAL_API_SECRET`) |
| `CRON_SECRET` | mesmo comando |
| `CHAT_ENCRYPTION_KEY` | mesmo comando — **32 bytes, base64**. Nunca troque depois de configurada (mensagens já gravadas ficam ilegíveis) |
| `INTEGRATION_ENCRYPTION_KEY` | mesmo comando — **32 bytes, base64**. Obrigatória: sem ela, o boot FALHA em produção |
| `DB_PASSWORD` | a senha que você setou no passo 2 pro `app_user` |
| `DB_SSL_CA_BASE64` / `DB_SSL_CERT_BASE64` / `DB_SSL_KEY_BASE64` | gerados no passo 1 |
| `REDIS_SSL_CA_BASE64` / `REDIS_SSL_CERT_BASE64` / `REDIS_SSL_KEY_BASE64` | se for usar TLS no Redis — mesmo processo do passo 1, com os certificados do Redis gerenciado |

### Credenciais reais de produção (nunca as de teste/sandbox)

| Variável | Observação |
|---|---|
| `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_WEBHOOK_SECRET` | credenciais reais da conta MP do lojista — nunca as `TEST-...` de sandbox |
| `MERCADO_PAGO_SANDBOX` | `false` |
| `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_TOKEN`/`DISCORD_CLIENT_SECRET` | OAuth apps configurados com o domínio real de produção no redirect URI |
| `EMAIL_USER`/`EMAIL_PASS` | conta Gmail real (senha de app, não a senha normal da conta) |
| `WEBHOOK_URL` | webhook real do Discord pra log de login |
| `PLATFORM_LEGAL_NAME`, `PLATFORM_CONTACT_EMAIL` | dados reais da plataforma |

### Específicas deste deploy

| Variável | Valor |
|---|---|
| `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER` | dados do Postgres gerenciado (passo 1); `DB_USER=app_user` |
| `WEBSITE_URL` | domínio público real (`https://...`) |
| `NODE_ENV` | `production` |
| `PORT` | o que a Square Cloud expuser pro container (ver painel) — `lib/cron/internalScheduler.ts` lê isso pro loopback |
| `INTERNAL_CRON_ENABLED` | `true` (ver [item e](#crons) abaixo) ou `false` se for usar agendador externo |
| `REDIS_URL` | endpoint do Redis gerenciado (`rediss://...` se TLS) |
| `PAYMENT_PROVIDER` | **deixe vazio** (nunca `mock` em produção — `lib/payments/index.ts` já recusa cair no mock escondido se `NODE_ENV=production`) |
| `SHIPPING_PROVIDER` | vazio (credenciais do Melhor Envio continuam vindo do banco, configuradas pela dashboard) |

### Opcionais (degradam, não bloqueiam)

`SENTRY_DSN` (sem isso, erros não são reportados — recomendado configurar
antes do primeiro deploy real, item B4/B1 dependem disso pra visibilidade),
`GA4_MEASUREMENT_ID`, `META_PIXEL_ID`, `ROOT_DOMAIN`/`DEFAULT_STORE_ID`
(só se for multi-loja desde já), `HOST_VALIDATION`/`TRUSTED_PROXY`/
`ALLOWED_HOSTS` (deixe no padrão até decidir, ver
`docs/security/host-validation.md`), `ORDER_EXPIRATION_HOURS`,
`ABANDONED_CART_HOURS`.

### Começam em `report`, promovem depois (ver [passo 7](#7-promover-report--enforce))

`CSP_MODE=report`, `CSRF_MODE=report`.

## 5. Deploy

```bash
bash scripts/deploy/build_and_zip.sh
# gera deploy.zip na raiz de client/ — sobe esse arquivo no painel da
# Square Cloud (ou via CLI deles, se preferir)
```

O zip não tem `node_modules` — a Square Cloud precisa instalar as
dependências a partir do `package-lock.json` incluído (confirme isso no
painel/doc deles; é o comportamento esperado de praticamente todo PaaS
Node, mas não testado aqui de ponta a ponta).

## Crons

Duas opções pra disparar `/api/internal/cron/{expire-orders,abandoned-cart-email}`
sem agendador nativo na plataforma:

- **Scheduler interno** (`INTERNAL_CRON_ENABLED=true`) — já implementado,
  roda dentro do próprio processo, chama as rotas via loopback com os
  headers certos. Mais simples: nada além de uma env var. Único
  contêiner, então não duplica disparo.
- **Agendador externo** — ex: um workflow do GitHub Actions com
  `on: schedule:` fazendo `curl -X POST https://seu-dominio/api/internal/cron/expire-orders -H "x-cron-secret: ..." -H "x-internal-orchestrator: ..."`.
  Mais resiliente a reinício do container (não depende do processo estar
  vivo no momento exato), tem histórico de execução visível no GitHub —
  mas é mais uma coisa pra manter/configurar (os 2 segredos como GitHub
  Secrets do repositório).

Escolha **um só** dos dois — nunca os dois ao mesmo tempo (dispararia a
mesma rotina duas vezes).

## 6. Testes pós-deploy

Nessa ordem, antes de considerar o deploy "pronto":

1. `GET /api/health` — espera `{ ok: true, redis: "ok"|"not_configured" }`.
   `redis: "unreachable"` com `REDIS_URL` configurada indica problema de
   TLS/rede com o Redis gerenciado — investigue antes de seguir.
2. Login (Google, Discord, e-mail) — confirma OAuth redirect URIs batendo
   com o domínio real e que o banco está respondendo.
3. Fluxo de checkout completo com o Mercado Pago **real** (não sandbox) —
   confirma credenciais de pagamento e webhook.
4. Se `INTERNAL_CRON_ENABLED=true`: espere ~1h (ou dispare manualmente
   via `curl` com os headers certos) e confirme no log que
   `[internalScheduler]` rodou sem erro.
5. `SELECT COUNT(*) FROM pg_policies WHERE policyname = 'tenant_isolation';`
   no banco — deve bater com o número de tabelas multi-tenant (49 no
   schema desta sessão); confirma que a RLS realmente foi criada no banco
   de produção, não só no `DB_atual.sql`.

## 7. Promover report → enforce

Depois de alguns dias de tráfego real sem nada suspeito:

- `CSRF_MODE=report` → `enforce` — sem runbook formal à parte; observe se
  não aparece `[CSRF report-only]` nos logs em fluxos legítimos
  (dashboard, checkout, chat) antes de promover.
- `CSP_MODE=report` → `enforce` — siga o runbook em `docs/security/csp.md`
  (mínimo 7 dias, critério de promoção documentado lá).
- `HOST_VALIDATION=off` → `report` → `enforce` — só depois de confirmar a
  topologia real de rede da Square Cloud (segue atrás de proxy/CDN deles,
  ou a origem é alcançável direto?); siga
  `docs/security/host-validation.md`.
