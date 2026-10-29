"use server";

import { log } from "../logger";
import { getOrCreatePool } from "./pool";

export async function initApp() {
  try {
    const pool = getOrCreatePool();
    log.info("PostgreSQL pool criado");

    await pool.query("SELECT 1");

    log.info("PostgreSQL conectado com sucesso");
  } catch (err) {
    log.error("Falha ao conectar no PostgreSQL");
    console.error(err);
  }
}
