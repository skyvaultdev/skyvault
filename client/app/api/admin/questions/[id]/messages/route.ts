"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { createNotification } from "@/lib/notifications/createNotification";
import { ensureNotificationsTable } from "@/lib/notifications/ensureNotificationsTable";
import { ensureQuestionsTable } from "@/lib/questions/ensureQuestionsTable";

type Params = { params: Promise<{ id: string }> };

// A loja continua a conversa depois da primeira resposta. Marca como lida
// (a equipe acabou de responder) e avisa o cliente.
export async function POST(req: Request, { params }: Params) {
  try {
    const { session, denied } = await requirePermission("products.write");
    if (denied) return denied;

    const questionId = Number((await params).id);
    if (!Number.isSafeInteger(questionId) || questionId <= 0) return fail("INVALID_ID", 400);

    const body = await req.json();
    const text = String(body.body ?? "").trim();
    if (text.length < 2) return fail("MESSAGE_TOO_SHORT", 400);
    if (text.length > 1000) return fail("MESSAGE_TOO_LONG", 400);

    await ensureQuestionsTable();
    const db = getDB();
    const q = await db.query(
      `SELECT q.id, q.user_id, q.answer, p.name AS product_name, p.slug
       FROM product_questions q JOIN products p ON p.id = q.product_id WHERE q.id = $1`,
      [questionId]
    );
    if (q.rows.length === 0) return fail("QUESTION_NOT_FOUND", 404);
    if (!q.rows[0].answer) return fail("ANSWER_FIRST", 409);

    await db.query(
      `INSERT INTO product_question_messages (question_id, author_type, author_name, body) VALUES ($1, 'staff', $2, $3)`,
      [questionId, session?.email ?? null, text]
    );
    await db.query(`UPDATE product_questions SET staff_unread = FALSE WHERE id = $1`, [questionId]);

    if (q.rows[0].user_id) {
      await ensureNotificationsTable();
      await createNotification(db, {
        userId: q.rows[0].user_id,
        type: "question_answer",
        title: `A loja respondeu na sua pergunta — ${q.rows[0].product_name}`,
        body: text.slice(0, 140),
        data: { productSlug: q.rows[0].slug },
      });
    }

    return ok({ created: true }, 201);
  } catch (error) {
    console.error("Erro ao responder na conversa (admin):", error);
    return fail("QUESTION_MESSAGE_ERROR", 500);
  }
}
