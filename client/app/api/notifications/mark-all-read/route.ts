"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";

export async function POST() {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const db = getDB();
    await db.query(`UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`, [userId]);
    return ok({ updated: true });
  } catch (error) {
    console.error("Erro ao marcar notificações como lidas:", error);
    return fail("NOTIFICATIONS_MARK_READ_ERROR", 500);
  }
}
