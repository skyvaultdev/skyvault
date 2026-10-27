import { Pool } from "pg";
import { config } from "@/config/configuration";

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

// Cria o pool uma única vez por processo (a instância global sobrevive ao
// hot-reload do Next em dev). `instrumentation.ts` chama initApp() no boot
// do servidor, então normalmente o pool já existe quando a primeira
// requisição chega — mas getDB() e o resolvedor de loja (tenantContext)
// também passam por aqui como rede de segurança: se por algum motivo o
// register() da instrumentation não rodar antes (ambiente que não suporta
// o hook, corrida entre processos, etc.), a primeira query cria o pool na
// hora em vez de derrubar a rota com "Database not initialized".
export function getOrCreatePool(): Pool {
  if (!global.pgPool) {
    const database = config.database;
    global.pgPool = new Pool({
      host: database.host,
      user: database.user,
      password: database.password,
      database: database.database,
      port: database.port,
    });
  }
  return global.pgPool;
}
