"use server";

import { getDB, withTransaction } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

type Params = { params: Promise<{ id: string }> };

// Resolve uma solicitação de saque — "paid" significa que o owner já
// pagou o revendedor por fora (Pix, transferência etc.) e está só
// registrando isso aqui; não existe integração de pagamento automático.
// "rejected" libera as comissões amarradas de volta pra poderem entrar
// numa solicitação futura.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { session, denied } = await requirePermission("resellers.manage");
    if (denied) return denied;

    const { id } = await params;
    const requestId = Number(id);
    if (!requestId) return fail("INVALID_REQUEST_ID", 400);

    const body = await req.json();
    const action = String(body.action ?? "");
    if (!["paid", "rejected"].includes(action)) return fail("INVALID_ACTION", 400);
    const note = body.note ? String(body.note).trim().slice(0, 500) || null : null;

    const db = getDB();
    const existing = await db.query(`SELECT id, status FROM reseller_payout_requests WHERE id = $1`, [requestId]);
    if (existing.rows.length === 0) return fail("PAYOUT_REQUEST_NOT_FOUND", 404);
    if (existing.rows[0].status !== "requested") return fail("PAYOUT_REQUEST_ALREADY_RESOLVED", 409);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE reseller_payout_requests SET status = $1, resolved_at = NOW(), resolved_by = $2, note = COALESCE($3, note) WHERE id = $4`,
        [action, session?.email ?? null, note, requestId]
      );

      if (action === "paid") {
        await client.query(
          `UPDATE reseller_commissions SET status = 'paid', paid_at = NOW() WHERE payout_request_id = $1 AND status = 'confirmed'`,
          [requestId]
        );
      } else {
        // Rejeitado — solta as comissões pra poderem entrar num pedido de
        // saque futuro (continuam 'confirmed', só sem payout_request_id).
        await client.query(
          `UPDATE reseller_commissions SET payout_request_id = NULL WHERE payout_request_id = $1`,
          [requestId]
        );
      }
    });

    return ok({ updated: true, status: action });
  } catch (error) {
    console.error("Erro ao resolver solicitação de saque:", error);
    return fail("PAYOUT_REQUEST_UPDATE_ERROR", 500);
  }
}
