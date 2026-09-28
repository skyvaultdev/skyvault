"use server";

import { withTransaction } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireReseller } from "@/lib/auth/reseller";

// Pega TODAS as comissões confirmadas e ainda não amarradas a uma
// solicitação (payout_request_id IS NULL) — evita que o revendedor peça
// saque da mesma comissão duas vezes clicando repetido antes do owner
// resolver a primeira solicitação.
export async function POST() {
  try {
    const { reseller, denied } = await requireReseller();
    if (denied) return denied;
    if (!reseller.pix_key) return fail("MISSING_PIX_KEY", 409);

    const result = await withTransaction(async (client) => {
      const pendingRes = await client.query(
        `SELECT id, commission_amount FROM reseller_commissions
         WHERE reseller_id = $1 AND status = 'confirmed' AND payout_request_id IS NULL
         FOR UPDATE`,
        [reseller.id]
      );
      if (pendingRes.rows.length === 0) return { noBalance: true as const };

      const amount = pendingRes.rows.reduce((sum, r) => sum + Number(r.commission_amount), 0);
      const requestRes = await client.query(
        `INSERT INTO reseller_payout_requests (reseller_id, amount) VALUES ($1, $2) RETURNING id`,
        [reseller.id, amount]
      );
      const requestId = requestRes.rows[0].id;

      await client.query(
        `UPDATE reseller_commissions SET payout_request_id = $1 WHERE id = ANY($2)`,
        [requestId, pendingRes.rows.map((r) => r.id)]
      );

      return { noBalance: false as const, requestId, amount };
    });

    if (result.noBalance) return fail("NO_BALANCE_AVAILABLE", 400);
    return ok({ requestId: result.requestId, amount: result.amount }, 201);
  } catch (error) {
    console.error("Erro ao solicitar saque:", error);
    return fail("PAYOUT_REQUEST_ERROR", 500);
  }
}
