"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { ensureNotificationsTable } from "@/lib/notifications/ensureNotificationsTable";

export async function GET() {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    await ensureNotificationsTable();
    const db = getDB();
    const res = await db.query(`SELECT COUNT(*) AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [userId]);
    return ok({ count: Number(res.rows[0]?.unread ?? 0) });
  } catch (error) {
    console.error("Erro ao contar notificações não lidas:", error);
    return fail("NOTIFICATIONS_UNREAD_COUNT_ERROR", 500);
  }
}
