import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";
import { config } from "@/config/configuration";

// Qual loja (tenant) está atendendo a requisição atual.
//
// Ordem: (1) contexto explícito via runWithStore() — usado por tarefas que
// vivem além da requisição (streams SSE/timers); (2) Host da requisição;
// (3) sem contexto de requisição: só cai na loja padrão em modo
// single-tenant (ROOT_DOMAIN vazio). Em modo multi-loja sem contexto o
// código FALHA em vez de adivinhar uma loja (fail closed).

export class StoreNotFoundError extends Error {
  constructor(host: string | null) {
    super(`STORE_NOT_FOUND:${host ?? "?"}`);
    this.name = "StoreNotFoundError";
  }
}

const storage = new AsyncLocalStorage<number>();

export function runWithStore<T>(storeId: number, fn: () => T): T {
  return storage.run(storeId, fn);
}

type CacheEntry = { id: number | null; exp: number };
const g = globalThis as unknown as { __storeHostCache?: Map<string, CacheEntry> };
const cache = (g.__storeHostCache ??= new Map<string, CacheEntry>());
const CACHE_TTL_MS = 60_000;

function normalizeHost(raw: string | null): string | null {
  if (!raw) return null;
  const host = raw.trim().toLowerCase().replace(/:\d+$/, "");
  return host || null;
}

function isLocalOrIp(host: string): boolean {
  return host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith(".localhost");
}

async function queryStoreId(host: string): Promise<number | null> {
  const pool = global.pgPool;
  if (!pool) throw new Error("Database not initialized");
  const root = config.tenant.rootDomain;
  const sub = root && host.endsWith(`.${root}`) ? host.slice(0, -(root.length + 1)) : null;
  try {
    const res = await pool.query(
      `SELECT id FROM stores
       WHERE status <> 'disabled'
         AND (lower(custom_domain) = $1 OR ($2::text IS NOT NULL AND lower(slug) = $2::text))
       LIMIT 1`,
      [host, sub && !sub.includes(".") ? sub : null]
    );
    return res.rows[0] ? Number(res.rows[0].id) : null;
  } catch (err) {
    // 42P01: tabela `stores` ainda não existe (migration não rodou).
    if ((err as { code?: string }).code === "42P01") return null;
    throw err;
  }
}

export async function resolveStoreForHost(rawHost: string | null): Promise<number> {
  const host = normalizeHost(rawHost);
  const multi = !!config.tenant.rootDomain;

  if (host) {
    const hit = cache.get(host);
    if (hit && hit.exp > Date.now()) {
      if (hit.id !== null) return hit.id;
    } else {
      const id = await queryStoreId(host);
      cache.set(host, { id, exp: Date.now() + CACHE_TTL_MS });
      if (id !== null) return id;
    }
  }

  // Host não corresponde a nenhuma loja.
  const isRoot = !!host && (host === config.tenant.rootDomain || isLocalOrIp(host));
  if (!multi || isRoot) return config.tenant.defaultStoreId;
  throw new StoreNotFoundError(host);
}

export async function getCurrentStoreId(): Promise<number> {
  const explicit = storage.getStore();
  if (explicit !== undefined) return explicit;

  let host: string | null = null;
  try {
    host = (await headers()).get("host");
  } catch (err) {
    // Erros de controle do Next (ex: bail de renderização estática) precisam subir.
    if (err && typeof err === "object" && "digest" in err) throw err;
    if (config.tenant.rootDomain) throw new Error("NO_TENANT_CONTEXT");
    return config.tenant.defaultStoreId;
  }
  return resolveStoreForHost(host);
}

// Para layouts/páginas: host que não é de nenhuma loja vira 404.
export async function requireStoreOr404(notFound: () => never): Promise<number> {
  try {
    return await getCurrentStoreId();
  } catch (err) {
    if (err instanceof StoreNotFoundError) notFound();
    throw err;
  }
}
