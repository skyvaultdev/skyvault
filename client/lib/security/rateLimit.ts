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

// TLS mútuo opcional (mesmo esquema do Postgres — ver lib/database/pool.ts)
// — só usado se REDIS_URL já estiver configurada. As 3 vars são
// tudo-ou-nada, mesmo raciocínio: TLS mútuo incompleto não protege nada.
function buildRedisTlsConfig(): import("ioredis").RedisOptions["tls"] {
  const { sslCaBase64, sslCertBase64, sslKeyBase64 } = config.redis;
  if (!sslCaBase64 && !sslCertBase64 && !sslKeyBase64) return undefined;
  if (!sslCaBase64 || !sslCertBase64 || !sslKeyBase64) {
    throw new Error(
      "REDIS_SSL_CA_BASE64 / REDIS_SSL_CERT_BASE64 / REDIS_SSL_KEY_BASE64 precisam estar todas definidas juntas, ou nenhuma."
    );
  }
  return {
    ca: Buffer.from(sslCaBase64, "base64").toString("utf8"),
    cert: Buffer.from(sslCertBase64, "base64").toString("utf8"),
    key: Buffer.from(sslKeyBase64, "base64").toString("utf8"),
    rejectUnauthorized: true,
  };
}

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
    tls: buildRedisTlsConfig(),
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

// Item B4 — usado por GET /api/health pra reportar o estado real do
// Redis (não só "configurado ou não"): tenta um PING de verdade, com
// timeout curto, pra não travar o health check esperando uma conexão
// morta.
export async function getRedisStatus(): Promise<"ok" | "not_configured" | "unreachable"> {
  const client = lazyRedisClient();
  if (!client) return "not_configured";

  try {
    await Promise.race([
      client.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);
    return "ok";
  } catch {
    return "unreachable";
  }
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
