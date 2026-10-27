"use server";

import { Pool, PoolClient } from "pg";
import { tenantPool } from "./tenantPool";
import { getOrCreatePool } from "./pool";

declare global {
  var pgTenantPool: { raw: Pool; wrapped: Pool } | undefined;
}

export {};

export function getDB(): Pool {
  const pool = getOrCreatePool();

  if (!global.pgTenantPool || global.pgTenantPool.raw !== pool) {
    global.pgTenantPool = { raw: pool, wrapped: tenantPool(pool) };
  }
  return global.pgTenantPool.wrapped;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getDB();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
