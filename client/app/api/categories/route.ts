"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

async function ensureSchema() {
  const db = getDB();
  await db.query("ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT");
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug_unique ON categories(slug)");
  return db;
}

export async function GET(req: Request) {
  try {
    const db = await ensureSchema();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const result = await db.query("SELECT id, name, slug, image_url FROM categories WHERE id = $1", [Number(id)]);
      if (result.rows.length === 0) return fail("NOT_FOUND", 404);
      return ok(result.rows[0]);
    }

    const result = await db.query("SELECT id, name, slug, image_url FROM categories ORDER BY name ASC");
    return ok(result.rows);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const db = await ensureSchema();
    const contentType = req.headers.get("content-type") ?? "";

    let name = "";
    let slug = "";
    let imageUrl: string | null = null;
    let productIds: number[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      name = String(formData.get("name") ?? "").trim();
      slug = slugify(String(formData.get("slug") ?? name));
      const productsRaw = String(formData.get("product_ids") ?? "");
      productIds = productsRaw ? productsRaw.split(",").map((value) => Number(value)).filter((value) => Number.isFinite(value)) : [];

      const image = formData.get("image") as File | null;
      if (image && image.size > 0 && image.type.startsWith("image/")) {
        const uploadDir = path.join(process.cwd(), "public/uploads");
        await mkdir(uploadDir, { recursive: true });
        const ext = path.extname(image.name || ".jpg");
        const fileName = `${crypto.randomUUID()}${ext}`;
        await writeFile(path.join(uploadDir, fileName), Buffer.from(await image.arrayBuffer()));
        imageUrl = `/public/uploads/${fileName}`;
      }
    } else {
      const body = (await req.json()) as { name?: string; slug?: string; imageUrl?: string | null; productIds?: number[] };
      name = body.name?.trim() ?? "";
      slug = slugify(body.slug || name);
      imageUrl = body.imageUrl ?? null;
      productIds = Array.isArray(body.productIds) ? body.productIds : [];
    }

    if (!name) return fail("MISSING_NAME", 400);

    const created = await db.query(
      "INSERT INTO categories (name, slug, image_url) VALUES ($1, $2, $3) RETURNING id, name, slug, image_url",
      [name, slug, imageUrl]
    );

    const categoryId = created.rows[0].id;
    if (productIds.length > 0) {
      await db.query("UPDATE products SET category_id = $1 WHERE id = ANY($2::bigint[])", [categoryId, productIds]);
    }

    return ok(created.rows[0], 201);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
