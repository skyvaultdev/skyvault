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

    const withoutCategories = searchParams.get("withoutCategory");
    if (withoutCategories === "1") {
      const result = await db.query(`
        SELECT id, name, slug
        FROM products
        WHERE category_id IS NULL
        ORDER BY name ASC
      `);

      return ok(result.rows);
    }

    var name = searchParams.get("name")?.trim();
    var category = searchParams.get("category")?.trim();

    var params: Array<string | number> = [];
    var where: string[] = [];

    // Busca (por nome OU descrição) é paginada — é o caso de uso real de
    // /api/search no site público, onde um termo comum podia facilmente
    // passar de 100 resultados e o resto ficava invisível pra sempre (sem
    // "carregar mais", sem página 2). Os outros usos deste endpoint (sem
    // "name" — dropdowns/listas administrativas que esperam TODOS os
    // produtos de uma vez) continuam exatamente como antes, devolvendo um
    // array puro, pra não quebrar quem já chama isso hoje.
    const isSearch = !!name;
    let page = 1;
    let pageSize = 24;

    if (name) {
      page = Math.max(1, Number(searchParams.get("page")) || 1);
      pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 24));
      params.push(`%${name}%`);
      const nameIdx = params.length;
      params.push(`%${name}%`);
      const descIdx = params.length;
      where.push(`(p.name ILIKE $${nameIdx} OR p.description ILIKE $${descIdx})`);
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

    var whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    let total = 0;
    if (isSearch) {
      const countRes = await db.query(`SELECT COUNT(*) AS n FROM products p LEFT JOIN categories c ON c.id = p.category_id ${whereClause}`, params);
      total = Number(countRes.rows[0]?.n ?? 0);
    }

    const limitClause = isSearch ? `LIMIT $${params.length + 1} OFFSET $${params.length + 2}` : "LIMIT 100";
    const queryParams = isSearch ? [...params, pageSize, (page - 1) * pageSize] : params;

    const result = await db.query(
      `
      SELECT p.id, p.name, p.slug, p.description, p.price, p.active, p.position,
             p.category_id, p.stock_count,p.is_unlimited,p.stock_type,p.product_type,
             p.sku,p.weight_grams,p.length_cm,p.width_cm,p.height_cm,
             c.name AS category_name, c.slug AS category_slug,
            (
              SELECT pi.url
              FROM product_images pi
              WHERE pi.product_id = p.id
              ORDER BY pi.position ASC
              LIMIT 1
            ) AS image_url,
            (
              SELECT COALESCE(json_agg(json_build_object('id', pv.id, 'name', pv.name, 'price', pv.price,'stock_count', pv.stock_count,'is_unlimited',pv.is_unlimited, 'stock_type',pv.stock_type)), '[]')
              FROM product_variations pv
              WHERE pv.product_id = p.id
            ) AS variations
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${whereClause}
      ORDER BY COALESCE(p.position, 2147483647), p.created_at DESC
      ${limitClause}
      `,
      queryParams
    );

    if (isSearch) {
      return ok({ items: result.rows, total, page, pageSize });
    }
    return ok(result.rows);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}