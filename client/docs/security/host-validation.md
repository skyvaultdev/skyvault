# Validação de Host — como ligar (item C1)

Implementa a mitigação que [`host-header-resolution.md`](./host-header-resolution.md)
documentou como risco conhecido, não endereçado, por falta de certeza
sobre a topologia de proxy/CDN em produção. Fica **desligada por padrão**
(`HOST_VALIDATION=off`) — nenhuma mudança de comportamento até você
decidir ligar, depois de confirmar sua topologia real.

## As 3 variáveis

```bash
HOST_VALIDATION=off   # off (padrão) | report | enforce
TRUSTED_PROXY=false   # true só com proxy confiável garantido na frente
ALLOWED_HOSTS=        # hosts extras, além dos domínios em `stores`
```

## Passo 1 — descubra sua topologia

Responda: **a origem (processo Next) é alcançável diretamente pela
internet, sem passar obrigatoriamente por um proxy/CDN?**

- **Não sei** → fique em `HOST_VALIDATION=off` até descobrir. Ligar às
  cegas não protege nada — só adiciona comportamento sem necessariamente
  bater com a infra real.
- **Sim, a origem é exposta direto** (sem proxy obrigatório) → `TRUSTED_PROXY=false`
  sempre, independente do resto. Não existe header nenhum pra confiar
  aqui — qualquer um que bata na origem controla o `Host` que o app vê.
- **Não, só o proxy/CDN alcança a origem** (origem sem IP/porta públicos,
  ou bloqueada por firewall/security group pra só aceitar o proxy) →
  confirme também que esse proxy **reescreve** `Host`/`X-Forwarded-Host`
  com o valor real do visitante, não repassa o que o cliente mandou sem
  validar. Cloudflare, AWS ALB e nginx com `server_name` explícito fazem
  isso por padrão; um proxy "passthrough" genérico não.

## Passo 2 — escolha o modo

1. **`HOST_VALIDATION=report`** primeiro, sempre — nunca pule direto pra
   `enforce`. Em `report`, a resolução de loja continua exatamente como
   hoje (usa o `Host` puro); só loga quando o host "efetivo" (calculado
   considerando `TRUSTED_PROXY`) teria sido diferente ou cairia fora da
   allowlist. Observe esses logs por um tempo — rotas de staff no
   dashboard, webhooks, checkout, tudo que você normalmente usa.
2. Sem nenhum log inesperado depois de observar, promova pra
   **`HOST_VALIDATION=enforce`** — a resolução passa a usar o host
   efetivo de verdade (rejeita hosts desconhecidos com 404, igual já
   acontecia antes pra hosts fora da tabela `stores` — isso não muda).

## `TRUSTED_PROXY`

- `true`: o app passa a considerar `X-Forwarded-Host` (só o primeiro
  valor, se vierem vários proxies empilhados) em vez do `Host` puro.
  **Só ligue isso se confirmou no Passo 1** que existe um proxy confiável
  reescrevendo esse header — do contrário, qualquer cliente direto pode
  forjar `X-Forwarded-Host` livremente, e isso ligado nessas condições
  é PIOR que deixado desligado (abre uma forma nova de forjar o host que
  não existia antes).
- `false` (padrão): `X-Forwarded-Host` é ignorado por completo, mesmo que
  o cliente mande. Só o `Host` normal da conexão é considerado.

## `ALLOWED_HOSTS`

Hosts que devem resolver pra `DEFAULT_STORE_ID` sem precisar de uma linha
na tabela `stores` — por exemplo, um domínio de health-check externo, ou
um alias de staging que não é uma loja de verdade. Lista separada por
vírgula:

```bash
ALLOWED_HOSTS=status.minhaplataforma.com,staging.minhaplataforma.com
```

Hosts que SÃO lojas de verdade não precisam estar aqui — já são
resolvidos normalmente via `custom_domain`/`slug` em `stores`,
independente deste modo.

## O que NÃO muda

Nada disto substitui bloquear acesso direto à origem na própria
infraestrutura (security group/firewall), quando esse for o modelo certo
pra sua topologia — isso é configuração de infra, fora do escopo deste
repositório. `HOST_VALIDATION=enforce` é defesa em profundidade *em cima*
disso, não no lugar.
