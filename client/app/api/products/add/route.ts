"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

type Variation = {
  name: string;
  price: number;
};

type ProductBody = {
  name: string;
  slug?: string;
  description?: string;
  price: number;
  categoryId?: number | null;
  active?: boolean;
  variations?: Variation[];
};

async function ensureProductSchema() {
  const db = getDB();

  await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS position INT");
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug_unique ON products(slug)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_variations_product ON product_variations(product_id)");

  return db;
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

      const variationsRaw = formData.get("variations");
      let variations: Variation[] = [];

      if (variationsRaw) {
        try {
          variations = JSON.parse(String(variationsRaw));
        } catch {
          variations = [];
        }
      }

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
      if (Array.isArray(variations) && variations.length > 0) {
        for (const variation of variations) {
          const variationName = variation.name?.trim();
          const variationPrice = Number(variation.price);

          if (!variationName || !Number.isFinite(variationPrice) || variationPrice <= 0) {
            continue;
          }

          await db.query(
            `INSERT INTO product_variations (product_id, name, price)
             VALUES ($1, $2, $3)`,
            [productId, variationName, variationPrice]
          );
        }
      }

      const images = formData.getAll("images").filter((item) => item instanceof File) as File[];
      if (images.length > 0) {
        const uploadDir = path.join(process.cwd(), "public/uploads");
        await mkdir(uploadDir, { recursive: true });

        for (let index = 0; index < images.length; index++) {
          const image = images[index];
          if (!image.type.startsWith("image/")) continue;

          const ext = path.extname(image.name || ".jpg");
          const fileName = `${crypto.randomUUID()}${ext}`;
          const filePath = path.join(uploadDir, fileName);

          const bytes = Buffer.from(await image.arrayBuffer());
          await writeFile(filePath, bytes);

          await db.query(
            `INSERT INTO product_images (product_id, url, position)
             VALUES ($1, $2, $3)`,
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
       RETURNING id`,
      [
        name,
        slug,
        body.description?.trim() || null,
        price,
        body.categoryId ?? null,
        body.active ?? true,
      ]
    );

    const productId = result.rows[0].id;
    if (Array.isArray(body.variations)) {
      for (const variation of body.variations) {
        const variationName = variation.name?.trim();
        const variationPrice = Number(variation.price);

        if (!variationName || !Number.isFinite(variationPrice) || variationPrice <= 0) {
          continue;
        }

        await db.query(
          `INSERT INTO product_variations (product_id, name, price)
           VALUES ($1, $2, $3)`,
          [productId, variationName, variationPrice]
        );
      }
    }

    return ok({ id: productId }, 201);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}