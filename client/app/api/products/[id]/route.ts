"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";

type Params = { params: Promise<{ id: string }> };

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    const db = getDB();
    const isNumeric = /^\d+$/.test(id);

    const result = await db.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${isNumeric ? "p.id = $1" : "p.slug = $1"}`,
      [isNumeric ? Number(id) : id]
    );

    if (result.rows.length === 0) return fail("NOT_FOUND", 404);

    const product = result.rows[0];
    const images = await db.query(
      `SELECT id, url, position FROM product_images WHERE product_id = $1 ORDER BY position ASC`,
      [product.id]
    );

    const variations = await db.query(
      `SELECT id, name, price, stock_count, is_unlimited FROM product_variations WHERE product_id = $1 ORDER BY id ASC`,
      [product.id]
    );

    return ok({
      ...product,
      images: images.rows,
      variations: variations.rows
    });

  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}