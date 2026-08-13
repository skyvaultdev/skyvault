import { getDB } from "@/lib/database/db";
import { decryptToken } from "@/lib/security/tokenCrypto";

export type EfibankCredentials = {
  clientId: string;
  clientSecret: string;
  certPfx: Buffer;
  certPassword: string;
  pixKey: string;
  sandbox: boolean;
};

// Credenciais são do dono da loja (configuradas via dashboard → aba
// Configurações), nunca de env var — quem recebe o Pix é ele, não a
// plataforma. Ficam criptografadas no banco (AES-256-GCM); só chegam
// descriptografadas aqui, em memória, na hora de chamar a EfiBank.
export async function loadEfibankCredentials(): Promise<EfibankCredentials | null> {
  const db = getDB();
  const result = await db.query(`SELECT * FROM efibank_credentials ORDER BY id DESC LIMIT 1`);
  const row = result.rows[0];

  if (!row || !row.client_id || !row.client_secret_encrypted || !row.cert_data_encrypted || !row.pix_key) {
    return null;
  }

  return {
    clientId: row.client_id,
    clientSecret: decryptToken(row.client_secret_encrypted),
    certPfx: Buffer.from(decryptToken(row.cert_data_encrypted), "base64"),
    certPassword: row.cert_password_encrypted ? decryptToken(row.cert_password_encrypted) : "",
    pixKey: row.pix_key,
    sandbox: row.sandbox !== false,
  };
}

export async function isEfibankConfigured(): Promise<boolean> {
  return (await loadEfibankCredentials()) !== null;
}
