"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireReseller } from "@/lib/auth/reseller";

const PIX_KEY_TYPES = ["cpf", "cnpj", "email", "phone", "random"];

export async function GET() {
  try {
    const { reseller, denied } = await requireReseller();
    if (denied) return denied;

    return ok({
      pixKey: reseller.pix_key ?? null,
      pixKeyType: reseller.pix_key_type ?? null,
      pixHolderName: reseller.pix_holder_name ?? null,
    });
  } catch (error) {
    console.error("Erro ao buscar credenciais PIX:", error);
    return fail("PIX_CREDENTIALS_FETCH_ERROR", 500);
  }
}

export async function PUT(req: Request) {
  try {
    const { reseller, denied } = await requireReseller();
    if (denied) return denied;

    const body = await req.json();
    const pixKey = String(body.pixKey ?? "").trim().slice(0, 200);
    const pixKeyType = String(body.pixKeyType ?? "").trim();
    const pixHolderName = String(body.pixHolderName ?? "").trim().slice(0, 150);

    if (!pixKey || !pixHolderName) return fail("MISSING_FIELDS", 400);
    if (!PIX_KEY_TYPES.includes(pixKeyType)) return fail("INVALID_PIX_KEY_TYPE", 400);

    const db = getDB();
    await db.query(
      `UPDATE resellers SET pix_key = $1, pix_key_type = $2, pix_holder_name = $3 WHERE id = $4`,
      [pixKey, pixKeyType, pixHolderName, reseller.id]
    );

    return ok({ updated: true });
  } catch (error) {
    console.error("Erro ao salvar credenciais PIX:", error);
    return fail("PIX_CREDENTIALS_SAVE_ERROR", 500);
  }
}
