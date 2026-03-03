"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

async function ensureSchema() {
  const db = getDB();
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug_unique
    ON categories(slug)
  `);

  return db;
}

export async function POST(req: Request) {
  try {
    const db = await ensureSchema();

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return fail("INVALID_CONTENT_TYPE", 400);
    }

    const formData = await req.formData();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return fail("MISSING_NAME", 400);

    let slug = slugify(name);
    const slugCheck = await db.query(`SELECT 1 FROM categories WHERE slug = $1`,
      [slug]
    );

    if (slugCheck.rowCount > 0) {
      slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
    }
    
    const productsRaw = String(formData.get("product_ids") ?? "");
    const productIds: number[] = productsRaw
      ? productsRaw
        .split(",")
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v))
      : [];

    const created = await db.query(`INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id, name, slug`,
      [name, slug]
    );

    const categoryId = created.rows[0].id;
    if (productIds.length > 0) {
      await db.query(`UPDATE products SET category_id = $1 WHERE id = ANY($2::bigint[]) AND category_id IS NULL`,
        [categoryId, productIds]
      );
    }

    return ok(
      {
        ...created.rows[0],
        assignedProducts: productIds.length,
      },
      201
    );
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}