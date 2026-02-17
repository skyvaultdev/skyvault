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
           WHERE p.slug = $1`,
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