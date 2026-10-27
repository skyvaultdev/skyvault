"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { requirePermission } from "@/lib/auth/guard";
import { normalizeDocument, validateDocument } from "@/lib/legal/documentValidation";

// Separada de /api/store-settings (que é pública) — aqui ficam os dados
// legais completos, incluindo os 3 textos de política grandes, só pra
// quem tem permissão de editar a loja. O rodapé/checkout usam os campos
// pequenos (legal_name, document, address, contact_email, contact_phone)
// via a rota pública; esta aqui é só o CRUD do dashboard.
export async function GET() {
  try {
    const { denied } = await requirePermission("store.customize");
    if (denied) return denied;

    const db = getDB();
    const result = await db.query(`
      SELECT legal_name, document, address, contact_email, contact_phone,
             privacy_policy, returns_policy, store_terms
      FROM store_settings
      ORDER BY id DESC LIMIT 1
    `);

    return ok(result.rows[0] ?? {});
  } catch (error) {
    console.error("GET /api/store-settings/legal error:", error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { denied } = await requirePermission("store.customize");
    if (denied) return denied;

    const body = await req.json();

    const legalName = String(body.legalName ?? "").trim();
    const address = String(body.address ?? "").trim();
    const contactEmail = String(body.contactEmail ?? "").trim();
    const contactPhone = String(body.contactPhone ?? "").trim();
    const privacyPolicy = String(body.privacyPolicy ?? "").trim();
    const returnsPolicy = String(body.returnsPolicy ?? "").trim();
    const storeTerms = String(body.storeTerms ?? "").trim();

    // Documento é opcional (muitos lojistas ainda não cadastraram), mas se
    // algo foi digitado, tem que ser um CPF/CNPJ válido de verdade — nunca
    // aceita um valor que passa pelo bloqueio de vendas (item 8) sem ser
    // um documento real.
    const documentDigits = normalizeDocument(String(body.document ?? ""));
    if (documentDigits && !validateDocument(documentDigits)) {
      return fail("INVALID_DOCUMENT", 400);
    }

    const db = getDB();
    const current = await db.query(`SELECT id FROM store_settings ORDER BY id DESC LIMIT 1`);
    const row = current.rows[0];
    if (!row) return fail("STORE_SETTINGS_NOT_FOUND", 404);

    const updated = await db.query(
      `UPDATE store_settings SET
         legal_name = $1,
         document = $2,
         address = $3,
         contact_email = $4,
         contact_phone = $5,
         privacy_policy = $6,
         returns_policy = $7,
         store_terms = $8,
         updated_at = NOW()
       WHERE id = $9
       RETURNING legal_name, document, address, contact_email, contact_phone,
                 privacy_policy, returns_policy, store_terms`,
      [
        legalName || null,
        documentDigits || null,
        address || null,
        contactEmail || null,
        contactPhone || null,
        privacyPolicy || null,
        returnsPolicy || null,
        storeTerms || null,
        row.id,
      ]
    );

    return ok(updated.rows[0]);
  } catch (error) {
    console.error("POST /api/store-settings/legal error:", error);
    return fail("INTERNAL_ERROR", 500);
  }
}
