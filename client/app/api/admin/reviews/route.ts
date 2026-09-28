"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { ensureReviewsTable } from "@/lib/reviews/ensureReviewsTable";

export async function GET(req: Request) {
  try {
    const { denied } = await requirePermission("products.write");
    if (denied) return denied;

    await ensureReviewsTable();
    const rawPage = Number(new URL(req.url).searchParams.get("page"));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;
    const pageSize = 15;
    const db = getDB();
    const [items, total] = await Promise.all([
      db.query(
        `SELECT r.id, r.product_id, r.reviewer_name, r.rating, r.comment, r.image_urls, r.hidden, r.created_at, p.name AS product_name
         FROM product_reviews r JOIN products p ON p.id = r.product_id
         ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`,
        [pageSize, (page - 1) * pageSize]
      ),
      db.query(`SELECT COUNT(*) AS total FROM product_reviews`),
    ]);
    return ok({ items: items.rows, total: Number(total.rows[0].total), page, pageSize });
  } catch (error) {
    console.error("Erro ao listar avaliações (admin):", error);
    return fail("REVIEWS_ADMIN_FETCH_ERROR", 500);
  }
}
