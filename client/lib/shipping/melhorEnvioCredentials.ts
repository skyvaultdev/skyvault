import { getDB } from "@/lib/database/db";
import { decryptToken } from "@/lib/security/tokenCrypto";

export type MelhorEnvioCredentials = {
  accessToken: string;
  sandbox: boolean;
};

// Token é do dono da loja (aba Transportadoras), não dos devs — mesmo
// padrão de lib/payments/mercadoPagoCredentials.ts: criptografado no banco,
// só descriptografado em memória na hora de chamar a API do Melhor Envio.
export async function loadMelhorEnvioCredentials(): Promise<MelhorEnvioCredentials | null> {
  const db = getDB();
  const result = await db.query(`SELECT * FROM melhor_envio_credentials ORDER BY id DESC LIMIT 1`);
  const row = result.rows[0];

  if (!row || !row.access_token_encrypted) {
    return null;
  }

  return {
    accessToken: decryptToken(row.access_token_encrypted),
    sandbox: row.sandbox !== false,
  };
}

export async function isMelhorEnvioConfigured(): Promise<boolean> {
  return (await loadMelhorEnvioCredentials()) !== null;
}
