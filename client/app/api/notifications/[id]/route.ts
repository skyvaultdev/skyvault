"use server";

import { getDB, withTransaction } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";

type Params = { params: Promise<{ id: string }> };

// Ações possíveis numa notificação: marcar como lida (qualquer tipo), ou
// aceitar/recusar um convite de revendedor — a resposta ao convite mora
// AQUI, não numa página separada de "candidatura", porque o revendedor não
// se candidata mais, ele é convidado (ver resellers.status = 'invited' em
// app/api/resellers/invite/route.ts).
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const { id } = await params;
    const notificationId = Number(id);
    if (!notificationId) return fail("INVALID_NOTIFICATION_ID", 400);

    const body = await req.json();
    const action = String(body.action ?? "read");
    if (!["read", "accept_reseller_invite", "decline_reseller_invite"].includes(action)) {
      return fail("INVALID_ACTION", 400);
    }

    const db = getDB();
    const notifRes = await db.query(`SELECT * FROM notifications WHERE id = $1 AND user_id = $2`, [notificationId, userId]);
    if (notifRes.rows.length === 0) return fail("NOTIFICATION_NOT_FOUND", 404);
    const notification = notifRes.rows[0];

    if (action === "read") {
      await db.query(`UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1`, [notificationId]);
      return ok({ updated: true });
    }

    if (notification.type !== "reseller_invite") return fail("NOT_A_RESELLER_INVITE", 400);
    const resellerId = notification.data?.resellerId;
    if (!resellerId) return fail("INVALID_INVITE_DATA", 500);

    const newStatus = action === "accept_reseller_invite" ? "approved" : "rejected";

    await withTransaction(async (client) => {
      const resellerRes = await client.query(`SELECT id, user_id, status FROM resellers WHERE id = $1 FOR UPDATE`, [resellerId]);
      if (resellerRes.rows.length === 0 || resellerRes.rows[0].user_id !== userId) {
        throw new Error("RESELLER_MISMATCH");
      }
      if (resellerRes.rows[0].status !== "invited") {
        throw new Error("INVITE_ALREADY_RESOLVED");
      }
      await client.query(`UPDATE resellers SET status = $1, approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END WHERE id = $2`, [newStatus, resellerId]);
      await client.query(`UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1`, [notificationId]);
    });

    return ok({ updated: true, status: newStatus });
  } catch (error) {
    if (error instanceof Error && error.message === "RESELLER_MISMATCH") return fail("RESELLER_MISMATCH", 403);
    if (error instanceof Error && error.message === "INVITE_ALREADY_RESOLVED") return fail("INVITE_ALREADY_RESOLVED", 409);
    console.error("Erro ao atualizar notificação:", error);
    return fail("NOTIFICATION_UPDATE_ERROR", 500);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const { id } = await params;
    const notificationId = Number(id);
    if (!notificationId) return fail("INVALID_NOTIFICATION_ID", 400);

    const db = getDB();
    const res = await db.query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [notificationId, userId]);
    if (res.rowCount === 0) return fail("NOTIFICATION_NOT_FOUND", 404);

    return ok({ deleted: true });
  } catch (error) {
    console.error("Erro ao remover notificação:", error);
    return fail("NOTIFICATION_DELETE_ERROR", 500);
  }
}
