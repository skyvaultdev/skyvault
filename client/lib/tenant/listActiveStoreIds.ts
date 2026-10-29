import { getOrCreatePool } from "@/lib/database/pool";
import { config } from "@/config/configuration";

// Usado pelos crons internos (expire-orders, abandoned-cart-email) pra
// rodar em TODAS as lojas numa chamada só — o cron bate uma vez na
// aplicação, não por subdomínio. `stores` é consultada direto pelo pool
// cru (sem o wrapper de tenant), igual lib/tenant/tenantContext.ts faz —
// essa tabela não tem RLS de propósito, é ela que resolve qual loja é qual.
export async function listActiveStoreIds(): Promise<number[]> {
  const pool = getOrCreatePool();
  let storeIds: number[];
  try {
    const storesRes = await pool.query(`SELECT id FROM stores WHERE status <> 'disabled'`);
    storeIds = storesRes.rows.map((r) => Number(r.id));
  } catch (err) {
    // 42P01: tabela `stores` não existe (modo single-tenant, migration de
    // multi-loja nunca rodou) — cai só na loja padrão.
    if ((err as { code?: string })?.code === "42P01") {
      storeIds = [config.tenant.defaultStoreId];
    } else {
      throw err;
    }
  }
  return storeIds.length > 0 ? storeIds : [config.tenant.defaultStoreId];
}
