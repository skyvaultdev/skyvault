"use server";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { rateLimit } from "@/lib/security/rateLimit";
import { ensureReviewsTable } from "@/lib/reviews/ensureReviewsTable";

type Params = { params: Promise<{ id: string }> };

const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

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

    await ensureReviewsTable();
    const { searchParams } = new URL(req.url);
    const rawPage = Number(searchParams.get("page"));
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;
    const pageSize = 5;
    const db = getDB();

    const [summary, items] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE rating >= 4) AS positive,
                COALESCE(AVG(rating), 0) AS average
         FROM product_reviews WHERE product_id = $1 AND hidden = false`,
        [productId]
      ),
      db.query(
        `SELECT id, reviewer_name, rating, comment, image_urls, created_at
         FROM product_reviews WHERE product_id = $1 AND hidden = false
         ORDER BY (COALESCE(comment, '') <> '' OR array_length(image_urls, 1) > 0) DESC, created_at DESC
         LIMIT $2 OFFSET $3`,
        [productId, pageSize, (page - 1) * pageSize]
      ),
    ]);

    const total = Number(summary.rows[0].total);
    const positive = Number(summary.rows[0].positive);
    return ok({
      total,
      approvalPercent: total > 0 ? Math.round((positive / total) * 100) : null,
      average: total > 0 ? Number(Number(summary.rows[0].average).toFixed(1)) : null,
      items: items.rows,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Erro ao listar avaliações:", error);
    return fail("REVIEWS_FETCH_ERROR", 500);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { userId, email, denied } = await requireCustomer();
    if (denied) return denied;

    const { id } = await params;
    const productId = Number(id);
    if (!productId) return fail("INVALID_PRODUCT_ID", 400);
    if (!rateLimit(`product-review:${userId}`, 5, 10 * 60_000)) return fail("TOO_MANY_REQUESTS", 429);

    const form = await req.formData();
    const rating = Number(form.get("rating"));
    const comment = String(form.get("comment") ?? "").trim().slice(0, 1500);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail("INVALID_RATING", 400);

    const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > MAX_IMAGES) return fail("TOO_MANY_IMAGES", 400);
    for (const file of files) {
      if (!IMAGE_EXT[file.type]) return fail("INVALID_IMAGE_TYPE", 400);
      if (file.size > MAX_IMAGE_SIZE) return fail("IMAGE_TOO_LARGE", 400);
    }

    await ensureReviewsTable();
    const db = getDB();

    // Só quem comprou (pedido pago/entregue) avalia.
    const purchase = await db.query(
      `SELECT o.id AS order_id
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.user_id = $1 AND oi.product_id = $2 AND o.status IN ('paid', 'delivered')
       ORDER BY o.id DESC LIMIT 1`,
      [userId, productId]
    );
    if (purchase.rows.length === 0) return fail("NOT_A_BUYER", 403);

    const existing = await db.query(`SELECT 1 FROM product_reviews WHERE user_id = $1 AND product_id = $2`, [userId, productId]);
    if (existing.rows.length > 0) return fail("ALREADY_REVIEWED", 409);

    const urls: string[] = [];
    if (files.length > 0) {
      const dir = path.join(process.cwd(), "public", "uploads", "reviews");
      await mkdir(dir, { recursive: true });
      for (const file of files) {
        const name = `${crypto.randomUUID()}${IMAGE_EXT[file.type]}`;
        await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
        urls.push(`/uploads/reviews/${name}`);
      }
    }

    const profile = await db.query(`SELECT full_name FROM customer_profiles WHERE email = $1`, [email]);
    const user = await db.query(`SELECT username FROM users WHERE id = $1`, [userId]);
    const name = shortName(profile.rows[0]?.full_name || user.rows[0]?.username || String(email).split("@")[0]);

    await db.query(
      `INSERT INTO product_reviews (product_id, user_id, order_id, reviewer_name, rating, comment, image_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [productId, userId, purchase.rows[0].order_id, name, rating, comment || null, urls]
    );

    return ok({ created: true }, 201);
  } catch (error) {
    console.error("Erro ao criar avaliação:", error);
    return fail("REVIEW_CREATE_ERROR", 500);
  }
}
