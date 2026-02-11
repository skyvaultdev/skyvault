"use server";

import { Pool } from "pg";
import { log } from "../logger";

declare global {
  var pgPool: Pool | undefined;
}

export {};

export function getDB(): Pool {
  if (!global.pgPool) {
    log.error("Database not initialized. Call initApp first.");
    throw new Error("Database not initialized");
  }

  return global.pgPool;
}
