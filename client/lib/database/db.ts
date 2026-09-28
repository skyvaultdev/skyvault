"use server";

import { Pool, PoolClient } from "pg";
import { log } from "../logger";
import { tenantPool } from "./tenantPool";

declare global {
  var pgPool: Pool | undefined;
  var pgTenantPool: { raw: Pool; wrapped: Pool } | undefined;
}

export {};

export function getDB(): Pool {
  if (!global.pgPool) {
    log.error("Database not initialized. Call initApp first.");
    throw new Error("Database not initialized");
  }

  if (!global.pgTenantPool || global.pgTenantPool.raw !== global.pgPool) {
    global.pgTenantPool = { raw: global.pgPool, wrapped: tenantPool(global.pgPool) };
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
