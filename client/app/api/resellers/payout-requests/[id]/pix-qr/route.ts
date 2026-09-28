"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { buildPixPayload } from "@/lib/pix/buildPixPayload";

type Params = { params: Promise<{ id: string }> };

// Gera o payload do QR code PIX pra o owner pagar esse saque — só na hora
// que ele pede (não fica pré-calculado na listagem), pra não jogar a
// chave PIX do revendedor em toda resposta de /api/resellers/payout-requests.
export async function GET(_req: Request, { params }: Params) {
  try {
    const { denied } = await requirePermission("resellers.manage");
    if (denied) return denied;

    const { id } = await params;
    const requestId = Number(id);
    if (!requestId) return fail("INVALID_REQUEST_ID", 400);

    const db = getDB();
    const [payoutRes, storeRes] = await Promise.all([
      db.query(
        `SELECT p.id, p.amount, p.status, r.pix_key, r.pix_key_type, r.pix_holder_name
         FROM reseller_payout_requests p JOIN resellers r ON r.id = p.reseller_id
         WHERE p.id = $1`,
        [requestId]
      ),
      db.query(`SELECT store_name FROM store_settings ORDER BY id DESC LIMIT 1`),
    ]);

    if (payoutRes.rows.length === 0) return fail("PAYOUT_REQUEST_NOT_FOUND", 404);
    const payout = payoutRes.rows[0];
    if (!payout.pix_key) return fail("RESELLER_NO_PIX_KEY", 409);

    const storeName = storeRes.rows[0]?.store_name || "Loja";

    const payload = buildPixPayload({
      pixKey: payout.pix_key,
      merchantName: storeName,
      merchantCity: "BRASIL",
      amount: Number(payout.amount),
      txid: `SAQUE${payout.id}`,
      description: `Comissao revendedor #${payout.id}`,
    });

    return ok({
      payload,
      pixHolderName: payout.pix_holder_name,
      pixKeyType: payout.pix_key_type,
      amount: Number(payout.amount),
    });
  } catch (error) {
    console.error("Erro ao gerar QR code PIX:", error);
    return fail("PIX_QR_GENERATION_ERROR", 500);
  }
}
