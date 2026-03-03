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