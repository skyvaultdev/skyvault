# Loja — client/

Loja virtual (Next.js App Router + Postgres). Este README cobre só o app
dentro de `client/` — é daqui que todos os comandos abaixo devem ser
rodados.

## Requisitos

- Node.js 20+
- PostgreSQL 16 (ou qualquer versão recente compatível)
- Uma conta Gmail com senha de app (para envio de e-mail) — opcional em dev
- Credenciais de Google/Discord OAuth e Mercado Pago — opcionais em dev
  (o login por e-mail e o provider de pagamento mock funcionam sem nada disso)

## Instalação

```bash
cd client
npm ci
cp .env.example .env.local   # preencha com valores reais (ver abaixo)
```

## Variáveis de ambiente

Todas as variáveis abaixo são lidas via `process.env` em algum lugar do
código (`config/configuration.ts` centraliza a maioria). `.env.example`
tem a lista completa, sem valores reais — copie para `.env.local` e
preencha.

| Variável | Obrigatória | Para quê |
|---|---|---|
| `WEBSITE_URL` | sim | URL pública do site — usada em links de e-mail, OG/canonical, `notification_url` do Mercado Pago |
| `ROOT_DOMAIN` | não | Liga o modo multi-loja (subdomínio/domínio próprio por loja). Vazio = loja única |
| `DEFAULT_STORE_ID` | não | Loja usada quando não há `ROOT_DOMAIN` ou o host não bate com nenhuma loja cadastrada (padrão: `1`) |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` | sim | Conexão com o Postgres |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | sim | Assinatura do cookie de sessão (`auth_token`) de clientes/staff |
| `DEV_JWT_SECRET`, `DEV_JWT_EXPIRES_IN` | não | Sessão do super-admin (`/dev`). Sem isso, um segredo aleatório é gerado a cada boot (sessões caem a cada restart) |
| `INTERNAL_API_SECRET` | sim | Segredo das chamadas servidor-a-servidor internas (hoje: `proxy.ts` → `POST /api/internal/sync-user`). Nunca reuse `JWT_SECRET` aqui |
| `EMAIL_USER`, `EMAIL_PASS` | não* | SMTP (Gmail) — login por código e e-mails de pedido. *Necessário em produção |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | não | Login social com Google |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_TOKEN`, `DISCORD_CLIENT_SECRET`, `DISCORD_SCOPES`, `WEBHOOK_URL` | não | Login social com Discord |
| `PAYMENT_PROVIDER` | não | `mock` força o provider de teste mesmo com credenciais reais configuradas. Em produção, sem isso e sem credenciais, o checkout responde 503 (nunca cai no mock escondido) |
| `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_WEBHOOK_SECRET`, `MERCADO_PAGO_SANDBOX` | não* | Credenciais da própria loja no Mercado Pago. *Necessário em produção pra cobrar de verdade |
| `SHIPPING_PROVIDER` | não | `fixed_table` força a tabela de frete fixa local (credenciais do Melhor Envio continuam vindo do banco, não de env var) |
| `ORDER_EXPIRATION_HOURS` | não | Horas até um pedido `pending_payment` expirar (padrão: `24`) — ver "Cron jobs" abaixo |
| `ABANDONED_CART_HOURS` | não | Horas até um carrinho ser considerado abandonado pro e-mail de recuperação (padrão: `24`) — ver "Cron jobs" abaixo |
| `CRON_SECRET` | sim, p/ os crons | Protege `POST /api/internal/cron/expire-orders` e `.../abandoned-cart-email` |
| `DEV_ALLOWED_ORIGINS` | não | Origens externas liberadas no dev server (túnel ngrok/Cloudflare etc.), separadas por vírgula |
| `PLATFORM_LEGAL_NAME`, `PLATFORM_CONTACT_EMAIL` | sim | Nome/contato de quem fornece a tecnologia (não a loja) — usado no contrato em `/termos-plataforma` e na linha de rodapé "Loja criada com ..." |
| `GA4_MEASUREMENT_ID`, `META_PIXEL_ID` | não | Pixels de analytics/conversão (Google Analytics 4, Meta Pixel). Sem nenhum definido, nenhum script extra é carregado |

## Banco de dados e migrations

Não há ORM nem migration runner — schema em SQL puro:

- `db/schema_full.sql` — dump completo do schema (referência; não é
  aplicado automaticamente, é só pra entender o estado atual).
- `db/migrations/*.sql` — arquivos datados (`AAAA-MM-DD_descricao.sql`),
  aplicados **manualmente**, em ordem, contra o banco:

```bash
psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" \
  -f db/migrations/2026-10-06_coupon_per_user_limit.sql
```

(repita pra cada migration nova, na ordem da data no nome do arquivo).

Arquivos que começam com `PROPOSAL_` **não são migrations aplicadas** —
são propostas em revisão, documentadas no próprio arquivo.

Várias rotas ainda criam/alteram tabelas em tempo de execução
(`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
como rede de segurança contra migration não aplicada — isso é redundante
com as migrations reais, mas intencionalmente não foi removido ainda (ver
`db/migrations/PROPOSAL_consolidate_runtime_schema_changes.sql` para a
lista completa e a proposta de consolidação).

## Testes

```bash
npx vitest run       # roda uma vez
npx vitest            # modo watch
```

A maioria dos testes faz integração real contra o banco configurado em
`.env.local` (criam e limpam suas próprias linhas, prefixadas com
`[TESTE]`/`teste-...@teste.com` — nunca tocam em dados existentes). Alguns
testes de rota simulam `next/headers` (cookies/sessão) pra poder chamar o
handler diretamente, fora do runtime de requisição do Next.

## Build e produção

```bash
npx tsc --noEmit   # type-check
npm run build      # next build
npm run start      # next start — serve o build de produção
```

Para manter o processo vivo em um VPS, use um gerenciador de processos
como o [PM2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
npm run build
pm2 start npm --name loja -- run start
pm2 save
pm2 startup   # configura o PM2 para subir com o sistema
```

`client/instrumentation.ts` inicializa o pool de conexões com o banco no
boot do processo (`register()`), então a primeira requisição depois de um
restart não paga o custo de abrir a conexão — e webhooks recebidos antes
de qualquer página carregar (ex: Mercado Pago, logo após o deploy) também
funcionam.

## Cron jobs

### Expirar pedidos pendentes

Pedidos `pending_payment` com mais de `ORDER_EXPIRATION_HOURS` horas
(padrão: 24) nunca são pagos e ficam presos nesse status pra sempre se
nada os encerrar. `POST /api/internal/cron/expire-orders` marca esses
pedidos como `expired` (e tenta cancelar qualquer Pix/boleto pendente no
Mercado Pago).

1. Defina `CRON_SECRET` no `.env` do servidor (um valor aleatório qualquer).
2. Agende uma chamada periódica (ex: a cada hora) a essa rota com o header
   `x-cron-secret`:

```bash
# crontab -e
0 * * * * curl -s -X POST https://sua-loja.com/api/internal/cron/expire-orders \
  -H "x-cron-secret: SEU_CRON_SECRET_AQUI" >> /var/log/expire-orders.log 2>&1
```

Sem `CRON_SECRET` configurado, a rota responde 500 e nunca expira nada —
ela nunca roda "por acidente" sem o segredo definido.

### Recuperação de carrinho abandonado

`POST /api/internal/cron/abandoned-cart-email` manda um e-mail pros
clientes com itens no carrinho há mais de `ABANDONED_CART_HOURS` horas
(padrão: 24) que ainda não foram avisados daquela versão do carrinho. Mesmo
segredo (`CRON_SECRET`) e mesmo formato de chamada do expire-orders:

```bash
# crontab -e
30 * * * * curl -s -X POST https://sua-loja.com/api/internal/cron/abandoned-cart-email \
  -H "x-cron-secret: SEU_CRON_SECRET_AQUI" >> /var/log/abandoned-cart-email.log 2>&1
```

## CI

`.github/workflows/ci.yml` roda, em todo push/PR: `npm ci`,
`npx tsc --noEmit`, `npx next build` e `npx vitest run`, contra um
Postgres 16 descartável do próprio workflow (schema + migrations
aplicados automaticamente antes dos testes).
