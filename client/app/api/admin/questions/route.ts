"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { ensureQuestionsTable, loadMessages } from "@/lib/questions/ensureQuestionsTable";

export async function GET(req: Request) {
  try {
    const { denied } = await requirePermission("products.write");
    if (denied) return denied;

    await ensureQuestionsTable();
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") ?? "pending"; // pending | all
    const rawPage = Number(searchParams.get("page"));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;
    const pageSize = 15;

    const where = filter === "all" ? "" : "WHERE q.staff_unread = TRUE AND q.hidden = false";
    const db = getDB();
    const [items, total, pending] = await Promise.all([
      db.query(
        `SELECT q.id, q.product_id, q.asker_name, q.question, q.answer, q.answered_by, q.answered_at, q.hidden, q.created_at, q.staff_unread,
                p.name AS product_name, p.slug AS product_slug
         FROM product_questions q JOIN products p ON p.id = q.product_id
         ${where} ORDER BY q.staff_unread DESC, q.created_at DESC LIMIT $1 OFFSET $2`,
        [pageSize, (page - 1) * pageSize]
      ),
      db.query(`SELECT COUNT(*) AS total FROM product_questions q ${where}`),
      db.query(`SELECT COUNT(*) AS n FROM product_questions WHERE staff_unread = TRUE AND hidden = false`),
    ]);

    const threads = await loadMessages(items.rows.map((r) => Number(r.id)));
    const shaped = items.rows.map((q) => ({ ...q, messages: threads.get(Number(q.id)) ?? [] }));

    return ok({ items: shaped, total: Number(total.rows[0].total), pending: Number(pending.rows[0].n), page, pageSize });
  } catch (error) {
    console.error("Erro ao listar perguntas (admin):", error);
    return fail("QUESTIONS_ADMIN_FETCH_ERROR", 500);
  }
}
