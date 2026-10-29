import { Pool, type PoolConfig } from "pg";
import { config } from "@/config/configuration";

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

// TLS mútuo (CA + certificado + chave de cliente) — a Square Cloud exige
// isso pro Postgres gerenciado (ver docs/deploy/squarecloud.md). Conteúdo
// em base64 via env, nunca um arquivo no pacote de deploy. Nenhuma das 3
// definida (dev local) = undefined = `pg` conecta sem TLS, igual sempre
// foi. As 3 são tudo-ou-nada: TLS mútuo sem uma das partes não é TLS
// mútuo, então falha alto (erro claro no boot) em vez de conectar sem
// client cert silenciosamente.
function buildSslConfig(): PoolConfig["ssl"] {
  const { sslCaBase64, sslCertBase64, sslKeyBase64 } = config.database;
  if (!sslCaBase64 && !sslCertBase64 && !sslKeyBase64) return undefined;
  if (!sslCaBase64 || !sslCertBase64 || !sslKeyBase64) {
    throw new Error(
      "DB_SSL_CA_BASE64 / DB_SSL_CERT_BASE64 / DB_SSL_KEY_BASE64 precisam estar todas definidas juntas, ou nenhuma — TLS mútuo sem uma das três partes não protege nada."
    );
  }
  return {
    ca: Buffer.from(sslCaBase64, "base64").toString("utf8"),
    cert: Buffer.from(sslCertBase64, "base64").toString("utf8"),
    key: Buffer.from(sslKeyBase64, "base64").toString("utf8"),
    rejectUnauthorized: true,
  };
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
      ssl: buildSslConfig(),
    });
  }
  return global.pgPool;
}
