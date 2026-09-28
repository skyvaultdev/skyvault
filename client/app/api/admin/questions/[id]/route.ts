"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { createNotification } from "@/lib/notifications/createNotification";
import { ensureNotificationsTable } from "@/lib/notifications/ensureNotificationsTable";

type Params = { params: Promise<{ id: string }> };

// Responder ou ocultar/reexibir uma pergunta. Ao responder, o cliente que
// perguntou recebe uma notificação com o nome do produto.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { session, denied } = await requirePermission("products.write");
    if (denied) return denied;

    const { id } = await params;
    const questionId = Number(id);
    if (!Number.isSafeInteger(questionId) || questionId <= 0) return fail("INVALID_ID", 400);

    const body = await req.json();
    const db = getDB();
    const existing = await db.query(
      `SELECT q.id, q.user_id, q.question, p.name AS product_name, p.slug
       FROM product_questions q JOIN products p ON p.id = q.product_id WHERE q.id = $1`,
      [questionId]
    );
    if (existing.rows.length === 0) return fail("QUESTION_NOT_FOUND", 404);
    const q = existing.rows[0];

    if (typeof body.read === "boolean") {
      await db.query(`UPDATE product_questions SET staff_unread = $1 WHERE id = $2`, [!body.read, questionId]);
      return ok({ updated: true });
    }

    if (typeof body.hidden === "boolean") {
      await db.query(`UPDATE product_questions SET hidden = $1 WHERE id = $2`, [body.hidden, questionId]);
      return ok({ updated: true });
    }

    const answer = String(body.answer ?? "").trim();
    if (answer.length < 2) return fail("ANSWER_TOO_SHORT", 400);
    if (answer.length > 1000) return fail("ANSWER_TOO_LONG", 400);

    await db.query(
      `UPDATE product_questions SET answer = $1, answered_by = $2, answered_at = NOW(), staff_unread = FALSE WHERE id = $3`,
      [answer, session?.email ?? null, questionId]
    );

    if (q.user_id) {
      await ensureNotificationsTable();
      await createNotification(db, {
        userId: q.user_id,
        type: "question_answer",
        title: `Sua pergunta foi respondida — ${q.product_name}`,
        body: `"${String(q.question).slice(0, 80)}" → ${answer.slice(0, 120)}`,
        data: { productSlug: q.slug },
      });
    }

    return ok({ updated: true });
  } catch (error) {
    console.error("Erro ao responder pergunta:", error);
    return fail("QUESTION_UPDATE_ERROR", 500);
  }
}
