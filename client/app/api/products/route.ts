"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

type ProductBody = {
  name: string;
  slug?: string;
  description?: string;
  price: number;
  categoryId?: number | null;
  active?: boolean;
};

async function ensureProductSchema() {
  const db = getDB();

  await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS position INT");

  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug_unique ON products(slug)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)");

  await db.query(`
    ALTER TABLE product_images
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await db.query("CREATE INDEX IF NOT EXISTS idx_product_images_product_position ON product_images(product_id, position)");

  return db;
}

export async function GET(req: Request) {
  try {
    const db = await ensureProductSchema();
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name")?.trim();
    const category = searchParams.get("category")?.trim();

    const params: Array<string | number> = [];
    const where: string[] = [];

    if (name) {
      params.push(`%${name}%`);
      where.push(`p.name ILIKE $${params.length}`);
    }
    if (category) {
      if (/^\d+$/.test(category)) {
        params.push(Number(category));
        where.push(`p.category_id = $${params.length}`);
      } else {
        params.push(category);
        where.push(`c.slug = $${params.length}`);
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const result = await db.query(
      `
      SELECT p.id, p.name, p.slug, p.description, p.price, p.active, p.position,
             p.category_id, c.name AS category_name, c.slug AS category_slug,
             (
               SELECT pi.url FROM product_images pi
               WHERE pi.product_id = p.id
               ORDER BY pi.position ASC, pi.created_at ASC
               LIMIT 1
             ) AS image_url
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${whereClause}
      ORDER BY COALESCE(p.position, 2147483647), p.created_at DESC
      LIMIT 100
      `,
      params
    );

    return ok(result.rows);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const db = await ensureProductSchema();
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const name = String(formData.get("name") ?? "").trim();
      const rawSlug = String(formData.get("slug") ?? "").trim();
      const description = String(formData.get("description") ?? "").trim();
      const price = Number(formData.get("price") ?? 0);
      const categoryIdRaw = formData.get("category_id");
      const active = String(formData.get("active") ?? "true") !== "false";
      const categoryId = categoryIdRaw ? Number(categoryIdRaw) : null;

      if (!name || !Number.isFinite(price) || price <= 0) {
        return fail("MISSING_FIELDS", 400);
      }

      const slug = slugify(rawSlug || name);
      const productResult = await db.query(
        `INSERT INTO products (name, slug, description, price, category_id, active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [name, slug, description || null, price, categoryId, active]
      );

      const productId: number = productResult.rows[0].id;
      const images = formData.getAll("images").filter((item) => item instanceof File) as File[];
      const singleImage = formData.get("image");
      if (singleImage instanceof File) images.push(singleImage);

      if (images.length > 0) {
        const uploadDir = path.join(process.cwd(), "public/uploads");
        await mkdir(uploadDir, { recursive: true });

        for (let index = 0; index < images.length; index += 1) {
          const image = images[index];
          if (!image.type.startsWith("image/")) continue;
          const ext = path.extname(image.name || ".jpg");
          const fileName = `${crypto.randomUUID()}${ext}`;
          const filePath = path.join(uploadDir, fileName);
          const bytes = Buffer.from(await image.arrayBuffer());
          await writeFile(filePath, bytes);
          await db.query(
            `INSERT INTO product_images (product_id, url, position) VALUES ($1, $2, $3)`,
            [productId, `/uploads/${fileName}`, index]
          );
        }
      }

      return ok({ id: productId }, 201);
    }
    const body = (await req.json()) as ProductBody;
    const name = body.name?.trim();
    const price = Number(body.price);

    if (!name || !Number.isFinite(price) || price <= 0) {
      return fail("MISSING_FIELDS", 400);
    }

    const slug = slugify(body.slug || name);
    const result = await db.query(
      `INSERT INTO products (name, slug, description, price, category_id, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, slug`,
      [
        name,
        slug,
        body.description?.trim() || null,
        price,
        body.categoryId ?? null,
        body.active ?? true,
      ]
    );

    return ok(result.rows[0], 201);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
