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
    const db = getDB();
    const formData = await req.formData();

    const name = String(formData.get("name") ?? "").trim();
    const rawSlug = String(formData.get("slug") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    
    const price = parseFloat(String(formData.get("price") ?? "0"));
    const categoryId = formData.get("category_id") ? Number(formData.get("category_id")) : null;
    const active = formData.get("active") === "true";

    if (!name || isNaN(price) || price <= 0) {
      return fail("DADOS_INVALIDOS", 400);
    }

    const slug = slugify(rawSlug || name);
    const productResult = await db.query(
      `INSERT INTO products (name, slug, description, price, category_id, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [name, slug, description || null, price, categoryId, active]
    );

    const productId = productResult.rows[0].id;
    const variationsRaw = formData.get("variations");
    if (variationsRaw) {
      const variations = JSON.parse(String(variationsRaw));
      for (const v of variations) {
        const vPrice = parseFloat(String(v.price ?? "0"));
        if (v.name && !isNaN(vPrice)) {
          await db.query(
            `INSERT INTO product_variations (product_id, name, price)
             VALUES ($1, $2, $3)`,
            [productId, v.name, vPrice]
          );
        }
      }
    }

    const images = formData.getAll("images") as File[];
    if (images.length > 0) {
      const uploadDir = path.join(process.cwd(), "public/uploads/products");
      await mkdir(uploadDir, { recursive: true });

      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        if (!file.type.startsWith("image/")) continue;

        const ext = path.extname(file.name) || ".jpg";
        const fileName = `${crypto.randomUUID()}${ext}`;
        const filePath = path.join(uploadDir, fileName);

        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(filePath, buffer);

        await db.query(
          `INSERT INTO product_images (product_id, url, position)
           VALUES ($1, $2, $3)`,
          [productId, `/uploads/products/${fileName}`, i]
        );
      }
    }

    return ok({ id: productId }, 201);
  } catch (error) {
    console.error("Erro ao adicionar produto:", error);
    return fail("ERRO_INTERNO", 500);
  }
}