"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requirePermission } from "@/lib/auth/guard";

type Variation = {
  name: string;
  price: number;
  stockCount?: number;
  isUnlimited?: boolean;
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

var VALID_PRODUCT_TYPES = ["digital", "physical"];

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
    const { denied } = await requirePermission("products.write");
    if (denied) return denied;

    const db = getDB();
    var formData = await req.formData();

    var name = String(formData.get("name") ?? "").trim();
    var rawSlug = String(formData.get("slug") ?? "").trim();
    var description = String(formData.get("description") ?? "").trim();
    
    var price = parseFloat(String(formData.get("price") ?? "0"));
    var categoryId = formData.get("category_id") ? Number(formData.get("category_id")) : null;
    var active = formData.get("active") === "true";

    var productTypeRaw = String(formData.get("product_type") ?? "digital");
    var productType = VALID_PRODUCT_TYPES.includes(productTypeRaw) ? productTypeRaw : "digital";
    var isPhysical = productType === "physical";

    var sku = isPhysical ? String(formData.get("sku") ?? "").trim() || null : null;
    var weightGrams = isPhysical && formData.get("weight_grams") ? Number(formData.get("weight_grams")) : null;
    var lengthCm = isPhysical && formData.get("length_cm") ? Number(formData.get("length_cm")) : null;
    var widthCm = isPhysical && formData.get("width_cm") ? Number(formData.get("width_cm")) : null;
    var heightCm = isPhysical && formData.get("height_cm") ? Number(formData.get("height_cm")) : null;
    var stockIsUnlimited = isPhysical && formData.get("stock_is_unlimited") === "true";
    var stockCount = isPhysical
      ? (stockIsUnlimited ? 0 : Number(formData.get("stock_count") ?? 0) || 0)
      : 0;

    if (!name || isNaN(price) || price <= 0) {
      return fail("DADOS_INVALIDOS", 400);
    }

    const slug = slugify(rawSlug || name);
    const productResult = await db.query(
      `INSERT INTO products (
         name, slug, description, price, category_id, active,
         product_type, sku, weight_grams, length_cm, width_cm, height_cm,
         stock_count, is_unlimited
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        name, slug, description || null, price, categoryId, active,
        productType, sku, weightGrams, lengthCm, widthCm, heightCm,
        stockCount, stockIsUnlimited,
      ]
    );

    const productId = productResult.rows[0].id;
    var variationsRaw = formData.get("variations");
    if (variationsRaw) {
      const variations = JSON.parse(String(variationsRaw));
      for (const v of variations) {
        var vPrice = parseFloat(String(v.price ?? "0"));
        if (v.name && !isNaN(vPrice)) {
          if (isPhysical) {
            var vIsUnlimited = Boolean(v.isUnlimited);
            var vStockCount = vIsUnlimited ? 0 : Number(v.stockCount ?? 0) || 0;
            await db.query(
              `INSERT INTO product_variations (product_id, name, price, stock_count, is_unlimited)
               VALUES ($1, $2, $3, $4, $5)`,
              [productId, v.name, vPrice, vStockCount, vIsUnlimited]
            );
          } else {
            await db.query(
              `INSERT INTO product_variations (product_id, name, price)
               VALUES ($1, $2, $3)`,
              [productId, v.name, vPrice]
            );
          }
        }
      }
    }

    var images = formData.getAll("images") as File[];
    if (images.length > 0) {
      const uploadDir = path.join(process.cwd(), "public/uploads/products");
      await mkdir(uploadDir, { recursive: true });

      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        if (!file.type.startsWith("image/")) continue;

        var ext = path.extname(file.name) || ".jpg";
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