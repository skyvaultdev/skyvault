"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { ensureNotificationsTable } from "@/lib/notifications/ensureNotificationsTable";
import { createNotificationForAllCustomers } from "@/lib/notifications/createNotification";

// Broadcast simples: uma notificação pra todo mundo em `users` (só
// clientes — staff vive em `admin`, tabela separada). Sem agendamento nem
// segmentação, é um aviso pontual (ex: "manutenção programada",
// "promoção nova").
export async function POST(req: Request) {
  try {
    const { denied } = await requirePermission("store.customize");
    if (denied) return denied;

    await ensureNotificationsTable();
    const db = getDB();

    const body = await req.json();
    const title = String(body.title ?? "").trim().slice(0, 200);
    const message = String(body.body ?? "").trim().slice(0, 1000);
    if (!title) return fail("MISSING_TITLE", 400);

    await createNotificationForAllCustomers(db, { title, body: message || null });

    const countRes = await db.query(`SELECT COUNT(*) AS total FROM users`);
    return ok({ sent: true, recipients: Number(countRes.rows[0]?.total ?? 0) });
  } catch (error) {
    console.error("Erro ao enviar anúncio:", error);
    return fail("ANNOUNCEMENT_SEND_ERROR", 500);
  }
}
