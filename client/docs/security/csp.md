# Content-Security-Policy — status e promoção para enforced

## Status atual: Report-Only

`next.config.ts` envia `Content-Security-Policy-Report-Only` em toda
resposta. Esse header **nunca bloqueia nada** — ele só instrui o navegador
a mandar um relatório para `POST /api/csp-report` (que só loga, via
`console.warn("[csp-report]", ...)`) sempre que algum recurso carregado
pela página violaria a política, se ela estivesse em modo enforced.

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

## Como promover para enforced

1. **Rodar o fluxo de checkout completo** (adicionar produto, ir pro
   carrinho, preencher endereço, abrir o Payment Brick, tentar os 3
   métodos — Pix, cartão, boleto — que a loja aceitar) com o DevTools
   aberto, aba Console: toda violação Report-Only aparece lá com
   `[Report Only]` no prefixo, mesmo sem a chamada em `/api/csp-report`
   funcionar.
2. **Checar os logs de `/api/csp-report`** (`[csp-report] ...`) depois de
   um período com tráfego real — cobre caminhos que o teste manual não
   bateu (ex: erro de cartão, 3DS, diferentes bancos emissores).
3. **Ajustar `CSP_DIRECTIVES`** em `next.config.ts` com qualquer domínio
   que apareça nos relatórios e ainda não esteja na lista.
4. Repetir 1–2 até não aparecer nenhuma violação legítima por pelo menos
   alguns dias de tráfego real (ignorando violação de extensão de
   navegador do próprio usuário, que não é algo que a loja controla).
5. **Trocar o header**: `Content-Security-Policy-Report-Only` →
   `Content-Security-Policy` em `next.config.ts`. A partir daí a política
   passa a bloquear de verdade.
6. Continuar mandando `report-uri` mesmo em modo enforced (detecta
   regressão se um domínio novo for necessário no futuro).

## Fora de escopo desta tarefa

- Nonce-based CSP (remover `'unsafe-inline'`).
- `frame-ancestors`/`X-Frame-Options` já cobertos (`DENY`/`'none'`), sem
  mudança aqui.
