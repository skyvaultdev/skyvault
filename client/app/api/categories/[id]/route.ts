"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    const db = getDB();

    const category = await db.query("SELECT id, name, slug, image_url FROM categories WHERE id = $1", [Number(id)]);
    if (category.rows.length === 0) return fail("NOT_FOUND", 404);

    const products = await db.query("SELECT id, name FROM products WHERE category_id = $1 ORDER BY name", [Number(id)]);
    return ok({ ...category.rows[0], products: products.rows });
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const db = getDB();
    const body = (await req.json()) as { name?: string; slug?: string; imageUrl?: string | null; productIds?: number[] };

    const current = await db.query("SELECT * FROM categories WHERE id = $1", [Number(id)]);
    if (current.rows.length === 0) return fail("NOT_FOUND", 404);

    const nextName = body.name?.trim() || current.rows[0].name;
    const nextSlug = slugify(body.slug || nextName);
    const nextImage = body.imageUrl ?? current.rows[0].image_url;

    const updated = await db.query(
      "UPDATE categories SET name = $1, slug = $2, image_url = $3 WHERE id = $4 RETURNING id, name, slug, image_url",
      [nextName, nextSlug, nextImage, Number(id)]
    );

    if (Array.isArray(body.productIds)) {
      await db.query("UPDATE products SET category_id = NULL WHERE category_id = $1", [Number(id)]);
      if (body.productIds.length > 0) {
        await db.query("UPDATE products SET category_id = $1 WHERE id = ANY($2::bigint[])", [Number(id), body.productIds]);
      }
    }

    return ok(updated.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function PUT(req: Request, ctx: Params) {
  return PATCH(req, ctx);
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    const db = getDB();
    await db.query("UPDATE products SET category_id = NULL WHERE category_id = $1", [Number(id)]);
    const deleted = await db.query("DELETE FROM categories WHERE id = $1 RETURNING id", [Number(id)]);
    if (deleted.rows.length === 0) return fail("NOT_FOUND", 404);
    return ok({ id: deleted.rows[0].id });
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
