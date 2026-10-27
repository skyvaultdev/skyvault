"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { requireCustomer } from "@/lib/auth/customer";

export async function GET() {
  const { userId, denied } = await requireCustomer();
  if (denied) return denied;

  const db = getDB();
  const result = await db.query(
    `SELECT w.product_id, w.created_at, p.name, p.slug, p.price, p.active,
            (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position ASC LIMIT 1) AS image_url
     FROM wishlist_items w
     JOIN products p ON p.id = w.product_id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId]
  );
  return ok(result.rows);
}

export async function POST(req: Request) {
  const { userId, denied } = await requireCustomer();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const productId = Number(body.productId);
  if (!productId) return fail("INVALID_PRODUCT_ID", 400);

  const db = getDB();
  await db.query(
    `INSERT INTO wishlist_items (user_id, product_id) VALUES ($1, $2) ON CONFLICT (user_id, product_id) DO NOTHING`,
    [userId, productId]
  );
  return ok({ added: true });
}
