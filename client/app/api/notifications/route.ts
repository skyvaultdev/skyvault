"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { ensureNotificationsTable } from "@/lib/notifications/ensureNotificationsTable";

export async function GET(req: Request) {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    await ensureNotificationsTable();
    const db = getDB();

    const { searchParams } = new URL(req.url);
    const rawPage = Number(searchParams.get("page"));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;
    const pageSize = 20;

    const [itemsRes, countRes, unreadRes] = await Promise.all([
      db.query(
        `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [userId, pageSize, (page - 1) * pageSize]
      ),
      db.query(`SELECT COUNT(*) AS total FROM notifications WHERE user_id = $1`, [userId]),
      db.query(`SELECT COUNT(*) AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [userId]),
    ]);

    return ok({
      items: itemsRes.rows,
      total: Number(countRes.rows[0]?.total ?? 0),
      unread: Number(unreadRes.rows[0]?.unread ?? 0),
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Erro ao listar notificações:", error);
    return fail("NOTIFICATIONS_FETCH_ERROR", 500);
  }
}
