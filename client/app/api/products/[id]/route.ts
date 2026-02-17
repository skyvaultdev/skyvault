"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    const db = getDB();
    const isNumeric = /^\d+$/.test(id);

    const result = isNumeric
      ? await db.query(
          `SELECT p.*, c.name as category_name, c.slug as category_slug
           FROM products p
           LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.id = $1`,
          [Number(id)]
        )
      : await db.query(
          `SELECT p.*, c.name as category_name, c.slug as category_slug
           FROM products p
           LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.slug = $1`,
          [id]
        );

    if (result.rows.length === 0) return fail("NOT_FOUND", 404);

    const images = await db.query(
      `SELECT id, url, position FROM product_images WHERE product_id = $1 ORDER BY position ASC`,
      [result.rows[0].id]
    );

    return ok({ ...result.rows[0], images: images.rows });
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) return fail("INVALID_ID", 400);

    const db = getDB();
    const body = (await req.json()) as {
      name?: string;
      slug?: string;
      description?: string;
      price?: number;
      categoryId?: number | null;
      active?: boolean;
    };

    const current = await db.query("SELECT * FROM products WHERE id = $1", [Number(id)]);
    if (current.rows.length === 0) return fail("NOT_FOUND", 404);
    const row = current.rows[0];

    const name = body.name?.trim() || row.name;
    const slug = slugify(body.slug || name);

    const result = await db.query(
      `UPDATE products
       SET name = $1, slug = $2, description = $3, price = $4, category_id = $5, active = $6
       WHERE id = $7
       RETURNING *`,
      [
        name,
        slug,
        body.description ?? row.description,
        body.price ?? row.price,
        body.categoryId ?? row.category_id,
        body.active ?? row.active,
        Number(id),
      ]
    );

    return ok(result.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function PUT(req: Request, ctx: Params) {
  return PATCH(req, ctx);
}
