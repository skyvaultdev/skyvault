import { getDB } from "@/lib/database/db";

export type StoreLegalInfo = {
  storeName: string;
  legalName: string | null;
  document: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  privacyPolicy: string | null;
  returnsPolicy: string | null;
  storeTerms: string | null;
};

// Lido direto do banco pelas 3 páginas públicas de política (privacidade,
// trocas-e-devolucoes, termos) — nenhuma delas passa pela API
// /api/store-settings, pra não carregar os 3 textos grandes em toda
// requisição de header/footer que usa aquela rota.
export async function loadStoreLegalInfo(): Promise<StoreLegalInfo> {
  const db = getDB();
  const res = await db.query(`
    SELECT store_name, legal_name, document, address, contact_email, contact_phone,
           privacy_policy, returns_policy, store_terms
    FROM store_settings
    ORDER BY id DESC LIMIT 1
  `);
  const row = res.rows[0] ?? {};
  return {
    storeName: row.store_name || "Minha Loja",
    legalName: row.legal_name || null,
    document: row.document || null,
    address: row.address || null,
    contactEmail: row.contact_email || null,
    contactPhone: row.contact_phone || null,
    privacyPolicy: row.privacy_policy || null,
    returnsPolicy: row.returns_policy || null,
    storeTerms: row.store_terms || null,
  };
}
