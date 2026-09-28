"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { rateLimit } from "@/lib/security/rateLimit";
import { ensureQuestionsTable } from "@/lib/questions/ensureQuestionsTable";

type Params = { params: Promise<{ id: string; qid: string }> };

// O cliente que fez a pergunta responde à resposta da loja. Só o autor da
// pergunta pode escrever, e só depois que a loja respondeu.
export async function POST(req: Request, { params }: Params) {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const { id, qid } = await params;
    const productId = Number(id);
    const questionId = Number(qid);
    if (!productId || !questionId) return fail("INVALID_ID", 400);

    if (!rateLimit(`question-reply:${userId}`, 10, 10 * 60_000)) return fail("TOO_MANY_REQUESTS", 429);

    const body = await req.json();
    const text = String(body.body ?? "").trim();
    if (text.length < 2) return fail("MESSAGE_TOO_SHORT", 400);
    if (text.length > 500) return fail("MESSAGE_TOO_LONG", 400);

    await ensureQuestionsTable();
    const db = getDB();
    const q = await db.query(
      `SELECT id, user_id, asker_name, answer, hidden FROM product_questions WHERE id = $1 AND product_id = $2`,
      [questionId, productId]
    );
    if (q.rows.length === 0 || q.rows[0].hidden) return fail("QUESTION_NOT_FOUND", 404);
    if (Number(q.rows[0].user_id) !== Number(userId)) return fail("NOT_QUESTION_OWNER", 403);
    if (!q.rows[0].answer) return fail("QUESTION_NOT_ANSWERED_YET", 409);

    await db.query(
      `INSERT INTO product_question_messages (question_id, author_type, author_name, user_id, body) VALUES ($1, 'customer', $2, $3, $4)`,
      [questionId, q.rows[0].asker_name, userId, text]
    );
    await db.query(`UPDATE product_questions SET staff_unread = TRUE WHERE id = $1`, [questionId]);

    return ok({ created: true }, 201);
  } catch (error) {
    console.error("Erro ao responder na conversa da pergunta:", error);
    return fail("QUESTION_MESSAGE_ERROR", 500);
  }
}
