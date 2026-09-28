import type { Pool, PoolClient } from "pg";
import { getCurrentStoreId } from "@/lib/tenant/tenantContext";

// Envolve o pool para que TODA query rode numa conexão com
// `app.store_id` = loja da requisição (é o que o RLS e o DEFAULT de
// store_id leem no banco). O valor é de sessão (set_config ... false) e só é
// reenviado quando a conexão passa de uma loja para outra, então no uso
// normal (uma loja por processo) custa zero round-trips extras.
//
// Nunca dá pra "esquecer": não existe caminho para o banco que não passe
// por aqui, e cada checkout de conexão religa a loja correta antes de usar.

const BOUND = Symbol("boundStoreId");
type BoundClient = PoolClient & { [BOUND]?: number };

async function bind(client: BoundClient, storeId: number) {
  if (client[BOUND] === storeId) return;
  client[BOUND] = undefined;
  await client.query("SELECT set_config('app.store_id', $1, false)", [String(storeId)]);
  client[BOUND] = storeId;
}

export function tenantPool(pool: Pool): Pool {
  return new Proxy(pool, {
    get(target, prop) {
      if (prop === "query") {
        return async (...args: unknown[]) => {
          const storeId = await getCurrentStoreId();
          const client = (await target.connect()) as BoundClient;
          try {
            await bind(client, storeId);
            return await (client.query as (...a: unknown[]) => unknown)(...args);
          } finally {
            client.release();
          }
        };
      }
      if (prop === "connect") {
        return async (...args: unknown[]) => {
          if (args.length > 0) return (target.connect as (...a: unknown[]) => unknown)(...args);
          const storeId = await getCurrentStoreId();
          const client = (await target.connect()) as BoundClient;
          try {
            await bind(client, storeId);
          } catch (err) {
            client.release();
            throw err;
          }
          return client;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
