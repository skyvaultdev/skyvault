# Content-Security-Policy — status e promoção para enforced

## Status atual: `CSP_MODE=report` (padrão)

`next.config.ts` lê `CSP_MODE` (`report` por padrão) e decide o nome do
header: `Content-Security-Policy-Report-Only` em `report` (nunca bloqueia
nada), `Content-Security-Policy` em `enforce` (bloqueia de verdade). O
navegador manda um relatório para `POST /api/csp-report` sempre que algum
recurso carregado pela página violaria a política, mesmo em modo report.

`POST /api/csp-report` (item C2) loga via `console.warn("[csp-report]",
...)` **e**, se `SENTRY_DSN` estiver configurado, agrega no Sentry —
agrupado por `fingerprint: [directive, blocked-uri]` (uma violação do
mesmo tipo vindo de visitantes diferentes vira UM Issue, não um por
visitante) e limitado a 1 envio por violação única a cada 10 minutos
(`rateLimit()`), pra não estourar a cota de eventos com uma extensão de
navegador ruidosa ou um recurso quebrado gerando a mesma violação pra
cada carregamento de página.

Isso existe porque o checkout usa o Payment Brick do Mercado Pago, que
carrega scripts e iframes de domínios deles — subir uma CSP genérica
direto em modo enforced quebraria o pagamento sem aviso nenhum.

## Por que a lista de domínios é um rascunho

Não existe uma lista oficial de domínios publicada pelo Mercado Pago para
CSP. A política em `next.config.ts` (constante `CSP_DIRECTIVES`) foi
montada com:

- `sdk.mercadopago.com` — confirmado em uso (`app/(private)/checkout/page.tsx`,
  `MP_SDK_SRC`).
- `*.mercadopago.com`, `*.mercadopago.com.br`, `*.mercadolibre.com`,
  `*.mlstatic.com` — wildcards cobrindo os subdomínios que o SDK
  provavelmente usa por baixo dos panos (API, secure-fields, eventos,
  assets estáticos), sem confirmação direta.
- `googletagmanager.com`, `google-analytics.com`, `connect.facebook.net`,
  `facebook.com` — domínios do GA4/Meta Pixel (`AnalyticsScripts.tsx`),
  só carregados se o servidor tiver `GA4_MEASUREMENT_ID`/`META_PIXEL_ID`
  configurados (`config/configuration.ts`).

## Gap conhecido: `'unsafe-inline'` em `script-src`/`style-src`

Os scripts inline do GA4/Meta Pixel (`<Script id="ga4-init">` etc.) e o
uso extensivo de `style={{...}}` no app exigiriam CSP baseada em nonce por
request para remover `'unsafe-inline'` — isso é uma mudança de arquitetura
maior (precisa gerar um nonce no middleware/proxy e repassar pra cada
`<script>`/`<style>`), fora do escopo deste primeiro rascunho report-only.
`'unsafe-inline'` reduz a proteção real da CSP contra XSS (os itens 2 e 3
do plano de segurança — JSON-LD e CSS do tema — já foram corrigidos na
origem; a CSP aqui é defesa em camadas, não a primeira linha).

## Runbook — como promover para enforced

1. **Rodar o fluxo de checkout completo** (adicionar produto, ir pro
   carrinho, preencher endereço, abrir o Payment Brick, tentar os 3
   métodos — Pix, cartão, boleto — que a loja aceitar) com o DevTools
   aberto, aba Console: toda violação Report-Only aparece lá com
   `[Report Only]` no prefixo, mesmo sem a chamada em `/api/csp-report`
   funcionar.
2. **Observe por pelo menos 7 dias de tráfego real** antes de considerar
   promover — cobre pelo menos um ciclo completo de uso (dias úteis +
   fim de semana, picos de horário) e caminhos que o teste manual não
   bate (erro de cartão, 3DS, diferentes bancos emissores, navegadores
   diferentes).
3. **Como ler as violações**:
   - **Com Sentry configurado** (recomendado): abra o projeto no Sentry,
     filtre por mensagem `CSP violation:` — cada Issue já vem agrupado
     por `(directive, blocked-uri)`, com o `extra` trazendo
     `documentUri`/`sourceFile`/`lineNumber` de onde a violação ocorreu.
     Ordene por contagem de eventos: o que aparece MUITAS vezes, em
     vários visitantes, é o que mais importa ajustar primeiro.
   - **Sem Sentry**: grep nos logs do servidor por `[csp-report]` —
     cada linha é um relatório bruto em JSON, sem agregação (vai
     repetir a mesma violação várias vezes; agrupe manualmente por
     `violated-directive`/`blocked-uri`).
   - **Domínios do Mercado Pago especificamente**: violações com
     `blocked-uri` contendo `mercadopago`, `mercadolibre` ou `mlstatic`
     quase sempre significam que o Payment Brick tentou carregar algo de
     um subdomínio não coberto pelos wildcards atuais — esses são
     prioridade máxima pra não quebrar o checkout.
4. **Ajustar `CSP_DIRECTIVES`** em `next.config.ts` com qualquer domínio
   legítimo que apareça nos relatórios e ainda não esteja na lista.
5. Repetir 1–3 até não aparecer nenhuma violação legítima **nova** nos
   últimos dias observados (ignore violação de extensão de navegador do
   próprio visitante — `blocked-uri` começando com `chrome-extension://`,
   `moz-extension://` etc. — isso não é algo que a loja controla nem
   afeta visitantes sem essa extensão).
6. **Critério objetivo pra promover**: zero violação legítima (não-extensão)
   nos últimos 7 dias consecutivos de observação. Promova trocando
   `CSP_MODE=report` → `CSP_MODE=enforce` no ambiente — não precisa
   mexer em código, só a env var.
7. Continue observando `/api/csp-report` mesmo em modo enforced (detecta
   regressão se um domínio novo passar a ser necessário no futuro — ex:
   o Mercado Pago muda de subdomínio).

## Fora de escopo desta tarefa

- Nonce-based CSP (remover `'unsafe-inline'`).
- `frame-ancestors`/`X-Frame-Options` já cobertos (`DENY`/`'none'`), sem
  mudança aqui.
