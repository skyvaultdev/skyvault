"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireDev } from "@/lib/devAuth/guard";
import { encryptToken } from "@/lib/security/tokenCrypto";

async function ensureSchema() {
  const db = getDB();
  await db.query(`
    CREATE TABLE IF NOT EXISTS efibank_credentials (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      client_id TEXT,
      client_secret_encrypted TEXT,
      cert_data_encrypted TEXT,
      cert_filename TEXT,
      cert_password_encrypted TEXT,
      pix_key TEXT,
      sandbox BOOLEAN NOT NULL DEFAULT TRUE,
      webhook_registered_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return db;
}

// Credenciais da EfiBank agora são dos DEVS (é a conta que recebe o
// dinheiro de verdade) — só a dashboard /dev pode ver se está configurado
// ou mexer nisso. O dono da loja não tem mais acesso a essa tela.
export async function GET() {
  try {
    const { denied } = await requireDev();
    if (denied) return denied;

    const db = await ensureSchema();
    const result = await db.query(`SELECT * FROM efibank_credentials ORDER BY id DESC LIMIT 1`);
    const row = result.rows[0];

    return ok({
      clientId: row?.client_id ?? "",
      hasClientSecret: !!row?.client_secret_encrypted,
      hasCert: !!row?.cert_data_encrypted,
      certFilename: row?.cert_filename ?? null,
      hasCertPassword: !!row?.cert_password_encrypted,
      pixKey: row?.pix_key ?? "",
      sandbox: row?.sandbox !== false,
      webhookRegisteredAt: row?.webhook_registered_at ?? null,
      configured: !!(row?.client_id && row?.client_secret_encrypted && row?.cert_data_encrypted && row?.pix_key),
    });
  } catch (error) {
    console.error("Erro ao buscar credenciais EfiBank:", error);
    return fail("EFIBANK_CREDENTIALS_FETCH_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { denied } = await requireDev();
    if (denied) return denied;

    const db = await ensureSchema();
    const form = await req.formData();

    const clientId = form.get("clientId")?.toString().trim() || null;
    const clientSecretRaw = form.get("clientSecret")?.toString().trim();
    const certPasswordRaw = form.get("certPassword")?.toString().trim();
    const pixKey = form.get("pixKey")?.toString().trim() || null;
    const sandbox = form.get("sandbox") !== "false";
    const certFile = form.get("cert");

    const current = await db.query(`SELECT * FROM efibank_credentials ORDER BY id DESC LIMIT 1`);
    const row = current.rows[0];

    let certDataEncrypted = row?.cert_data_encrypted ?? null;
    let certFilename = row?.cert_filename ?? null;

    if (certFile instanceof File && certFile.size > 0) {
      if (!certFile.name.toLowerCase().endsWith(".p12") && !certFile.name.toLowerCase().endsWith(".pfx")) {
        return fail("INVALID_CERT_FILE", 400);
      }
      const bytes = Buffer.from(await certFile.arrayBuffer());
      certDataEncrypted = encryptToken(bytes.toString("base64"));
      certFilename = certFile.name;
    }

    const clientSecretEncrypted = clientSecretRaw
      ? encryptToken(clientSecretRaw)
      : row?.client_secret_encrypted ?? null;

    const certPasswordEncrypted = certPasswordRaw
      ? encryptToken(certPasswordRaw)
      : row?.cert_password_encrypted ?? null;

    let result;
    if (row) {
      result = await db.query(
        `UPDATE efibank_credentials
         SET client_id = COALESCE($1, client_id),
             client_secret_encrypted = $2,
             cert_data_encrypted = $3,
             cert_filename = $4,
             cert_password_encrypted = $5,
             pix_key = COALESCE($6, pix_key),
             sandbox = $7,
             updated_at = NOW()
         WHERE id = $8
         RETURNING id`,
        [clientId, clientSecretEncrypted, certDataEncrypted, certFilename, certPasswordEncrypted, pixKey, sandbox, row.id]
      );
    } else {
      result = await db.query(
        `INSERT INTO efibank_credentials
           (client_id, client_secret_encrypted, cert_data_encrypted, cert_filename, cert_password_encrypted, pix_key, sandbox)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [clientId, clientSecretEncrypted, certDataEncrypted, certFilename, certPasswordEncrypted, pixKey, sandbox]
      );
    }

    return ok({ saved: true, id: result.rows[0].id });
  } catch (error) {
    console.error("Erro ao salvar credenciais EfiBank:", error);
    return fail("EFIBANK_CREDENTIALS_SAVE_ERROR", 500);
  }
}
