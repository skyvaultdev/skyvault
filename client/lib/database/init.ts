"use server";

import { Pool } from "pg";
import { log } from "../logger";
import { config } from "@/config/configuration";

declare global {
  var pgPool: Pool | undefined;
  //var intialized: boolean | undefined;
}
const database = config.database;

export async function initApp() {
  //if (global.intialized = true) return;

  try {
    if (!global.pgPool) {
      global.pgPool = new Pool({
        host: database.host,
        user: database.user,
        password: database.password,
        database: database.database,
        port: database.port,
      });

      log.info("PostgreSQL pool criado");
    }

    await global.pgPool.query("SELECT 1");

    log.info("PostgreSQL conectado com sucesso");
    //global.intialized = true;
  } catch (err) {
    log.error("Falha ao conectar no PostgreSQL");
    console.error(err);
  }
}
