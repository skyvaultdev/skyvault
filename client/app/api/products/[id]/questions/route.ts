"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { getOptionalCustomerId, requireCustomer } from "@/lib/auth/customer";
import { rateLimit } from "@/lib/security/rateLimit";
import { ensureQuestionsTable, loadMessages } from "@/lib/questions/ensureQuestionsTable";

type Params = { params: Promise<{ id: string }> };

// "Maria Silva" -> "Maria S." — a pergunta é pública, não expõe nome inteiro.
function shortName(full: string | null | undefined): string {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Cliente";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const productId = Number(id);
    if (!productId) return fail("INVALID_PRODUCT_ID", 400);

    await ensureQuestionsTable();
    const { searchParams } = new URL(req.url);
    const rawPage = Number(searchParams.get("page"));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;
    const pageSize = 5;

    const viewerId = await getOptionalCustomerId();
    const db = getDB();
    const [items, total] = await Promise.all([
      db.query(
        `SELECT id, user_id, asker_name, question, answer, answered_at, created_at
         FROM product_questions
         WHERE product_id = $1 AND hidden = false
         ORDER BY (answer IS NOT NULL) DESC, created_at DESC
         LIMIT $2 OFFSET $3`,
        [productId, pageSize, (page - 1) * pageSize]
      ),
      db.query(`SELECT COUNT(*) AS total FROM product_questions WHERE product_id = $1 AND hidden = false`, [productId]),
    ]);

    const threads = await loadMessages(items.rows.map((r) => Number(r.id)));
    const shaped = items.rows.map(({ user_id, ...q }) => ({
      ...q,
      mine: viewerId !== null && Number(user_id) === viewerId,
      messages: (threads.get(Number(q.id)) ?? []).map((m) => ({
        id: m.id, author_type: m.author_type, body: m.body, created_at: m.created_at,
        author_name: m.author_type === "staff" ? "Loja" : m.author_name,
      })),
    }));

    return ok({ items: shaped, total: Number(total.rows[0]?.total ?? 0), page, pageSize });
  } catch (error) {
    console.error("Erro ao listar perguntas:", error);
    return fail("QUESTIONS_FETCH_ERROR", 500);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { userId, email, denied } = await requireCustomer();
    if (denied) return denied;

    const { id } = await params;
    const productId = Number(id);
    if (!productId) return fail("INVALID_PRODUCT_ID", 400);

    if (!rateLimit(`product-question:${userId}`, 5, 10 * 60_000)) return fail("TOO_MANY_REQUESTS", 429);

    const body = await req.json();
    const question = String(body.question ?? "").trim();
    if (question.length < 5) return fail("QUESTION_TOO_SHORT", 400);
    if (question.length > 500) return fail("QUESTION_TOO_LONG", 400);

    await ensureQuestionsTable();
    const db = getDB();

    const productRes = await db.query(`SELECT id FROM products WHERE id = $1`, [productId]);
    if (productRes.rows.length === 0) return fail("PRODUCT_NOT_FOUND", 404);

    const profileRes = await db.query(`SELECT full_name FROM customer_profiles WHERE email = $1`, [email]);
    const userRes = await db.query(`SELECT username FROM users WHERE id = $1`, [userId]);
    const name = shortName(profileRes.rows[0]?.full_name || userRes.rows[0]?.username || String(email).split("@")[0]);

    await db.query(
      `INSERT INTO product_questions (product_id, user_id, asker_name, question, staff_unread) VALUES ($1, $2, $3, $4, TRUE)`,
      [productId, userId, name, question]
    );

    return ok({ created: true }, 201);
  } catch (error) {
    console.error("Erro ao criar pergunta:", error);
    return fail("QUESTION_CREATE_ERROR", 500);
  }
}
