"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";

export async function POST(req: Request) {
  try {
    const db = getDB();
    const formData = await req.formData();

    const identifier = String(formData.get("id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    
    if (!identifier || !name) return fail("ID_OR_SLUG_REQUIRED", 400);

    const newSlug = slugify(name);
    const productIdsRaw = String(formData.get("product_ids") ?? "");
    const productIds: number[] = productIdsRaw? productIdsRaw.split(",").map(Number).filter(n => !isNaN(n)) : [];

    const isNumeric = /^\d+$/.test(identifier);
    const updated = await db.query(
      `UPDATE categories 
       SET name = $1, slug = $2 
       WHERE id = ${isNumeric ? "$3::bigint" : "-1"} OR slug = $3
       RETURNING id, name, slug`,
      [name, newSlug, identifier]
    );

    if (updated.rowCount === 0) return fail("CATEGORY_NOT_FOUND", 404);
    const realCategoryId = updated.rows[0].id;

    if (productIds.length > 0) {
      await db.query(
        `UPDATE products 
         SET category_id = NULL 
         WHERE category_id = $1 AND NOT (id = ANY($2::bigint[]))`,
        [realCategoryId, productIds]
      );

      await db.query(
        `UPDATE products 
         SET category_id = $1 
         WHERE id = ANY($2::bigint[])`,
        [realCategoryId, productIds]
      );
    } else {
      await db.query(
        `UPDATE products SET category_id = NULL WHERE category_id = $1`,
        [realCategoryId]
      );
    }

    return ok({
      category: updated.rows[0],
      assignedProducts: productIds.length,
    });

  } catch (error) {
    console.error("Erro ao editar categoria:", error);
    return fail("INTERNAL_ERROR", 500);
  }
}