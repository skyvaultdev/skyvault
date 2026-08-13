"use server";

import { getDB, withTransaction } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireDev } from "@/lib/devAuth/guard";

type Params = { params: Promise<{ id: string }> };

const ALLOWED_STATUSES = ["approved", "paid", "rejected"];

// Aprovação/rejeição/pagamento de saque agora é ação exclusiva de dev —
// é a conta da EfiBank dos devs que efetivamente manda o dinheiro, então
// só quem tem acesso a ela pode confirmar que o pagamento saiu.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { session, denied } = await requireDev();
    if (denied) return denied;

    const { id } = await params;
    const withdrawalId = Number(id);
    if (!withdrawalId) return fail("INVALID_ID", 400);

    const { status } = await req.json();
    if (!ALLOWED_STATUSES.includes(status)) return fail("INVALID_STATUS", 400);

    const db = getDB();

    if (status !== "paid") {
      await db.query(
        `UPDATE withdrawal_requests
         SET status = $1, processed_at = NOW(), processed_by_dev_id = $2
         WHERE id = $3 AND status != 'paid'`,
        [status, session!.devId, withdrawalId]
      );
      return ok({ updated: true });
    }

    // Marcar como pago debita o saldo de verdade — atômico, com o mesmo
    // lock consultivo usado em confirmOrderPayment.
    await withTransaction(async (client) => {
      const wRes = await client.query(`SELECT * FROM withdrawal_requests WHERE id = $1 FOR UPDATE`, [withdrawalId]);
      if (wRes.rows.length === 0) throw new Error("WITHDRAWAL_NOT_FOUND");
      const withdrawal = wRes.rows[0];
      if (withdrawal.status === "paid") return; // idempotente

      await client.query(`SELECT pg_advisory_xact_lock(hashtext('wallet'))`);
      const balanceRes = await client.query(`SELECT COALESCE(SUM(amount), 0) AS balance FROM wallet_ledger`);
      const currentBalance = Number(balanceRes.rows[0].balance);
      const amount = Number(withdrawal.amount);
      if (amount > currentBalance) throw new Error("INSUFFICIENT_BALANCE");

      const newBalance = currentBalance - amount;
      await client.query(
        `INSERT INTO wallet_ledger (withdrawal_request_id, type, amount, balance_after, note)
         VALUES ($1, 'withdrawal_debit', $2, $3, $4)`,
        [withdrawalId, -amount, newBalance, `Resgate #${withdrawalId}`]
      );

      await client.query(
        `UPDATE withdrawal_requests SET status = 'paid', processed_at = NOW(), processed_by_dev_id = $1 WHERE id = $2`,
        [session!.devId, withdrawalId]
      );
    });

    return ok({ updated: true });
  } catch (error) {
    console.error("Erro ao atualizar resgate:", error);
    if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") {
      return fail("INSUFFICIENT_BALANCE", 409);
    }
    return fail("WITHDRAWAL_UPDATE_ERROR", 500);
  }
}
