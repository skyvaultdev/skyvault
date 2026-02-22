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