import Redis from "ioredis";
import { config } from "@/config/configuration";

// Fallback em memória (Map), por processo — só correto com uma única
// instância rodando (ver lazyRedisClient() abaixo pro caso de múltiplas
// réplicas). Também é o que roda sozinho sem REDIS_URL configurada, e o
// que cobre qualquer chamada individual se o Redis cair no meio do caminho.
const rateMap = new Map<string, { count: number; last: number }>();

function rateLimitInMemory(key: string, limit: number, windowMs: number): boolean {
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

let redisClient: Redis | null | undefined;

// Lazy + memoizado: só conecta se REDIS_URL estiver configurada, e só na
// primeira chamada real (não no boot do processo). `retryStrategy: null`
// desliga a reconexão automática infinita do ioredis — preferimos um
// client "morto" que a gente detecta e ignora (caindo pro fallback em
// memória) a ficar reconectando pra sempre em segundo plano.
function lazyRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  if (!config.redis.url) {
    redisClient = null;
    return redisClient;
  }

  const client = new Redis(config.redis.url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  client.on("error", (err) => {
    console.error("[rateLimit] erro de conexão com Redis — chamadas individuais caem pro fallback em memória:", err.message);
  });
  redisClient = client;
  return redisClient;
}

// Mesma chave compartilhada entre TODAS as instâncias do app quando o
// Redis está configurado — é isso que fecha o problema de "cada réplica
// conta separado" documentado antes. INCR é atômico no Redis; só quem
// incrementa de 0 pra 1 (ou seja, só a primeira requisição depois da
// chave expirar) seta o TTL da janela — expirações concorrentes nunca
// pisam uma na outra porque só UMA chamada consegue ver count === 1.
async function rateLimitRedis(client: Redis, key: string, limit: number, windowMs: number): Promise<boolean> {
  const redisKey = `ratelimit:${key}`;
  const count = await client.incr(redisKey);
  if (count === 1) {
    await client.pexpire(redisKey, windowMs);
  }
  return count <= limit;
}

export async function rateLimit(key: string, limit = 10, windowMs = 60_000): Promise<boolean> {
  const client = lazyRedisClient();
  if (!client) return rateLimitInMemory(key, limit, windowMs);

  try {
    return await rateLimitRedis(client, key, limit, windowMs);
  } catch (err) {
    // Redis fora do ar (ou essa chamada específica falhou) — nunca deixa
    // isso derrubar a rota que está chamando rateLimit(); cai pro fallback
    // em memória só pra essa chamada em vez de propagar o erro.
    console.error("[rateLimit] erro ao consultar Redis — usando fallback em memória pra essa chamada:", err);
    return rateLimitInMemory(key, limit, windowMs);
  }
}
