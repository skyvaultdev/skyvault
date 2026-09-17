"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { encryptToken } from "@/lib/security/tokenCrypto";

// Token é do dono da loja — só ele configura (gated por shipping.credentials,
// owner only). Quem só tem shipping.manage (admin) consegue ligar/desligar
// transportadoras e sincronizar, mas não ver nem editar o token em si.
export async function GET() {
  try {
    const { denied } = await requirePermission("shipping.credentials");
    if (denied) return denied;

    const db = getDB();
    const result = await db.query(`SELECT * FROM melhor_envio_credentials ORDER BY id DESC LIMIT 1`);
    const row = result.rows[0];

    return ok({
      hasAccessToken: !!row?.access_token_encrypted,
      sandbox: row?.sandbox !== false,
      configured: !!row?.access_token_encrypted,
    });
  } catch (error) {
    console.error("Erro ao buscar credenciais do Melhor Envio:", error);
    return fail("MELHOR_ENVIO_CREDENTIALS_FETCH_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { denied } = await requirePermission("shipping.credentials");
    if (denied) return denied;

    const db = getDB();
    const body = await req.json();

    const accessTokenRaw = String(body.accessToken ?? "").trim();
    const sandbox = body.sandbox !== false;

    const current = await db.query(`SELECT * FROM melhor_envio_credentials ORDER BY id DESC LIMIT 1`);
    const row = current.rows[0];

    const accessTokenEncrypted = accessTokenRaw ? encryptToken(accessTokenRaw) : row?.access_token_encrypted ?? null;

    let result;
    if (row) {
      result = await db.query(
        `UPDATE melhor_envio_credentials
         SET access_token_encrypted = $1, sandbox = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING id`,
        [accessTokenEncrypted, sandbox, row.id]
      );
    } else {
      result = await db.query(
        `INSERT INTO melhor_envio_credentials (access_token_encrypted, sandbox)
         VALUES ($1, $2)
         RETURNING id`,
        [accessTokenEncrypted, sandbox]
      );
    }

    return ok({ saved: true, id: result.rows[0].id });
  } catch (error) {
    console.error("Erro ao salvar credenciais do Melhor Envio:", error);
    return fail("MELHOR_ENVIO_CREDENTIALS_SAVE_ERROR", 500);
  }
}
