# Resolução de loja por Host header — risco conhecido

Item da Fase 4 do plano de segurança. `[DECISÃO]`: ao perguntar se existe
um CDN/proxy obrigatório na frente da origem em produção, a resposta foi
"não sei/não tenho certeza agora" — então isso ficou documentado como um
risco conhecido, sem mudança de código, até essa resposta ficar clara.

**Atualização (item C1)**: a mitigação descrita na seção "Como resolver"
abaixo já está implementada em `lib/tenant/tenantContext.ts`, desligada
por padrão (`HOST_VALIDATION=off`) — continua exigindo você confirmar a
topologia real antes de ligar. Ver
[`host-validation.md`](./host-validation.md) pro passo a passo de como
decidir e ligar quando a resposta ficar clara.

## O que é

Em modo multi-loja (`ROOT_DOMAIN` configurado), `lib/tenant/tenantContext.ts`
resolve qual loja atender **só pelo header `Host`** da requisição que
chega no processo Next. Esse header é controlado por quem faz a
requisição — forjável, a menos que algo na frente da origem garanta que
só requisições legítimas (com o `Host` real do cliente) cheguem até o
app.

`verifyJWTForStore` (`lib/jwt/storeAware.ts`) já invalida qualquer cookie
de sessão cujo `sid` não bata com a loja resolvida pelo Host — então isso
**não** permite logar como outra loja nem reusar sessão entre lojas
forjando o header. O risco real, se a origem for alcançável direto (sem
proxy confiável na frente), fica limitado a:

- Ver catálogo/dados públicos de outra loja via Host forjado — que é na
  verdade o comportamento ESPERADO de multi-tenant por domínio (não é
  uma falha, é como o roteamento por domínio deveria funcionar mesmo).
- Poluir dados de endpoints públicos não-autenticados de outra loja (ex:
  carrinho anônimo, newsletter) se a origem for exposta sem proxy
  confiável.

## Quando isso importa de verdade

Só é um risco prático se a origem (o processo Next rodando) for
alcançável **diretamente** pela internet, sem passar por um CDN/load
balancer/proxy reverso que:
1. Seja a única forma de chegar na origem (origem não tem IP/porta
   públicos acessíveis por fora dele), e
2. Repasse o `Host` real do visitante (não aceite um `Host` arbitrário
   do cliente sem validar contra os domínios configurados).

Cloudflare, a maioria dos load balancers gerenciados (AWS ALB, etc.) e um
nginx configurado com `server_name` explícito por domínio já cobrem isso
por padrão. Um proxy "passthrough" genérico (sem `server_name`/roteamento
por domínio configurado) não cobre.

## Como resolver, quando a resposta for clara

- **Se já existe um proxy confiável garantido**: nenhuma mudança de
  código necessária — só confirmar e, idealmente, bloquear o acesso
  direto à origem na própria infraestrutura (security group/firewall),
  não como código deste repositório.
- **Se não existe (ou não é garantido)**: adicionar uma segunda
  validação em `lib/tenant/tenantContext.ts` — por exemplo, exigir um
  header que só o proxy confiável injeta (ex: um segredo compartilhado
  num header customizado, verificado com `timingSafeEqual` como as
  outras rotas internas deste projeto — ver `lib/security/internalRequest.ts`)
  antes de confiar no `Host` puro pra resolver a loja.

Essa segunda opção não foi implementada agora porque sem saber a
topologia real, não dá pra saber que header o proxy real injetaria (cada
provedor usa um diferente) — implementar algo genérico às cegas correria
o risco de não bater com a infra de verdade e dar falsa sensação de
proteção.
