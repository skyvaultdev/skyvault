"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";

// Limpa só as JÁ LIDAS — um convite de revendedor pendente (não lido)
// nunca some sozinho, senão o cliente perde o convite sem ter respondido.
export async function POST() {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const db = getDB();
    const res = await db.query(`DELETE FROM notifications WHERE user_id = $1 AND read_at IS NOT NULL`, [userId]);
    return ok({ deleted: res.rowCount ?? 0 });
  } catch (error) {
    console.error("Erro ao limpar notificações:", error);
    return fail("NOTIFICATIONS_CLEAR_ERROR", 500);
  }
}
