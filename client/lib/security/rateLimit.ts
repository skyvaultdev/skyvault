// ATENÇÃO — estado em memória (Map), por processo: cada instância/processo
// do servidor tem seu PRÓPRIO contador. Isso funciona corretamente só se o
// deploy roda como um único processo Node (ex: um VPS com `next start` /
// PM2 em modo fork único). Se o deploy escalar pra múltiplas
// instâncias/processos (ex: várias réplicas atrás de um load balancer,
// múltiplos workers de um mesmo host, ou uma plataforma serverless que
// invoca funções em instâncias efêmeras/paralelas), cada uma conta
// separadamente — um atacante distribuído entre instâncias efetivamente
// multiplica o limite real por N, e mesmo um usuário legítimo só sofre
// throttle "por acaso" dependendo de qual instância atende cada request.
// Se isso deixar de ser verdade pra este projeto, troque por um contador
// compartilhado (Redis, ou uma tabela no Postgres com upsert atômico).
const rateMap = new Map<string, { count: number; last: number }>();

export function rateLimit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const entry = rateMap.get(key);

  if (!entry || now - entry.last > windowMs) {
    rateMap.set(key, { count: 1, last: now });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count++;
  return true;
}