"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB, withTransaction } from "@/lib/database/db";
import { requirePermission } from "@/lib/auth/guard";
import { ensureTeamTables, logTeamAction } from "@/lib/team/team";

type Params = { params: Promise<{ id: string }> };

// Ação "anonymize": apaga o que é PESSOAL (perfil, endereços) e troca
// email/username por um placeholder — NUNCA apaga a linha de users (os
// pedidos referenciam user_id; apagar a conta deixaria o histórico de
// vendas sem comprador, o que quebra contabilidade/auditoria). Pedidos em
// si continuam, só sem dado pessoal ligado a eles além do que já estava
// no snapshot do pedido (nome do produto, não do cliente).
export async function POST(req: Request, { params }: Params) {
  try {
    const { session, denied } = await requirePermission("users.manage");
    if (denied) return denied;
    await ensureTeamTables();

    const { id } = await params;
    const requestId = Number(id);
    if (!requestId) return fail("INVALID_REQUEST_ID", 400);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    const db = getDB();
    const current = await db.query(
      `SELECT r.user_id, r.status, u.email FROM data_subject_requests r JOIN users u ON u.id = r.user_id WHERE r.id = $1`,
      [requestId]
    );
    if (current.rows.length === 0) return fail("NOT_FOUND", 404);
    const { user_id: userId, status, email: currentEmail } = current.rows[0];
    if (status === "completed") return ok({ updated: false, reason: "ALREADY_COMPLETED" });

    if (action === "anonymize") {
      await withTransaction(async (client) => {
        await client.query(`DELETE FROM customer_profiles WHERE email = $1`, [currentEmail]);
        await client.query(`DELETE FROM shipping_addresses WHERE user_id = $1`, [userId]);
        await client.query(
          `UPDATE users SET email = $2, username = 'Usuário removido' WHERE id = $1`,
          [userId, `removido-${userId}@anonimizado.local`]
        );
        await client.query(
          `UPDATE data_subject_requests SET status = 'completed', processed_at = NOW(), processed_by = $2 WHERE id = $1`,
          [requestId, session?.email ?? "desconhecido"]
        );
      });

      await logTeamAction(db, session?.email ?? "desconhecido", "user.anonymize", `usuário #${userId}`, { requestId });
      return ok({ updated: true });
    }

    if (action === "dismiss") {
      await db.query(
        `UPDATE data_subject_requests SET status = 'completed', processed_at = NOW(), processed_by = $2 WHERE id = $1`,
        [requestId, session?.email ?? "desconhecido"]
      );
      await logTeamAction(db, session?.email ?? "desconhecido", "user.data_request_dismiss", `usuário #${userId}`, { requestId });
      return ok({ updated: true });
    }

    return fail("INVALID_ACTION", 400);
  } catch (error) {
    console.error("Erro ao processar solicitação de dados:", error);
    return fail("INTERNAL_ERROR", 500);
  }
}
