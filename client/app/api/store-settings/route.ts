"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requirePermission } from "@/lib/auth/guard";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

type StoreSettings = {
  id: number;
  primary_color: string;
  secondary_color: string;
  logo_url: string;
  background_style: string;
  background_img_url: string;
  background_css: string;
  updated_at: Date;
};

async function ensureSchema() {
  const db = await getDB();
  await db.query(`
    CREATE TABLE IF NOT EXISTS store_settings (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      primary_color TEXT NOT NULL DEFAULT '#b700ff',
      secondary_color TEXT NOT NULL DEFAULT '#6400ff',
      logo_url TEXT,
      background_style TEXT,
      background_img_url TEXT,
      background_css TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const columns = [
    "primary_color TEXT NOT NULL DEFAULT '#b700ff'",
    "secondary_color TEXT NOT NULL DEFAULT '#6400ff'",
    "store_name TEXT",
    "logo_url TEXT",
    "background_style TEXT",
    "background_img_url TEXT",
    "background_css TEXT",
    "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
  ];

  for (var col of columns) {
    var colName = col.split(" ")[0];
    await db.query(`ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS ${col}`);
  }

  await db.query(`
    INSERT INTO store_settings (primary_color, secondary_color)
    SELECT '#b700ff', '#6400ff'
    WHERE NOT EXISTS (SELECT 1 FROM store_settings)
  `);

  return db;
}

export async function GET() {
  try {
    const db = await ensureSchema();

    const result = await db.query(`
      SELECT *
      FROM store_settings
      ORDER BY id DESC
      LIMIT 1
    `);

    return ok(result.rows[0]);
  } catch (error) {
    console.error("GET Store Settings Error:", error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { denied } = await requirePermission("store.customize");
    if (denied) return denied;

    const db = await ensureSchema();
    var contentType = req.headers.get("content-type") ?? "";

    var primaryColor: string | undefined;
    var secondaryColor: string | undefined;
    var storeName: string | undefined;
    var logoUrl: string | undefined;
    var backgroundStyle: string | undefined;
    var backgroundCss: string | undefined;
    var backgroundImgUrl: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      var form = await req.formData();

      primaryColor = form.get("primaryColor")?.toString().trim() || undefined;
      secondaryColor = form.get("secondaryColor")?.toString().trim() || undefined;
      backgroundStyle = form.get("backgroundStyle")?.toString().trim() || undefined;
      backgroundCss = form.get("backgroundCss")?.toString() || undefined;
      storeName = form.get("storeName")?.toString().trim() || undefined;

      var image = form.get("backgroundImage");
      var logo = form.get("logoUrl");

      if (image instanceof File && image.size > 0) {
        if (image.size > MAX_IMAGE_SIZE) return fail("IMAGE_TOO_LARGE", 400);
        if (!ALLOWED_IMAGE_TYPES.includes(image.type)) return fail("INVALID_IMAGE_TYPE", 400);

        var uploadDir = path.join(process.cwd(), "public", "uploads", "store");
        await mkdir(uploadDir, { recursive: true });

        var ext = path.extname(image.name) || ".jpg";
        var fileName = `${crypto.randomUUID()}${ext}`;
        var filePath = path.join(uploadDir, fileName);

        var bytes = Buffer.from(await image.arrayBuffer());
        await writeFile(filePath, bytes);

        backgroundImgUrl = `/uploads/store/${fileName}`;
      }

      if (logo instanceof File && logo.size > 0) {
        if (logo.size > MAX_IMAGE_SIZE) return fail("IMAGE_TOO_LARGE", 400);
        if (!ALLOWED_IMAGE_TYPES.includes(logo.type)) return fail("INVALID_IMAGE_TYPE", 400);

        var uploadDir = path.join(process.cwd(), "public", "uploads", "store");

        await mkdir(uploadDir, { recursive: true });

        var ext = path.extname(logo.name) || ".png";
        var fileName = `logo-${crypto.randomUUID()}${ext}`;
        var filePath = path.join(uploadDir, fileName);

        var bytes = Buffer.from(await logo.arrayBuffer());

        await writeFile(filePath, bytes);

        logoUrl = `/uploads/store/${fileName}`;
      }

    } else {
      var body = await req.json();

      primaryColor = body.primaryColor?.trim();
      secondaryColor = body.secondaryColor?.trim();
      storeName = body.storeName?.trim();
      logoUrl = body.logoUrl?.trim();
      backgroundStyle = body.backgroundStyle?.trim();
      backgroundCss = body.backgroundCss;
      backgroundImgUrl = body.backgroundImgUrl?.trim();
    }

    const current = await db.query(`
      SELECT * FROM store_settings ORDER BY id DESC LIMIT 1
    `);

    var row = current.rows[0];
    if (!row) return fail("STORE_SETTINGS_NOT_FOUND", 404);

    const updated = await db.query(
      `
      UPDATE store_settings
      SET
        primary_color = COALESCE($1, primary_color),
        secondary_color = COALESCE($2, secondary_color),
        store_name = COALESCE($3, store_name),
        logo_url = COALESCE($4, logo_url),
        background_style = COALESCE($5, background_style),
        background_css = COALESCE($6, background_css),
        background_img_url = COALESCE($7, background_img_url),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
      `,
      [
        primaryColor ?? null,
        secondaryColor ?? null,
        storeName ?? null,
        logoUrl ?? null,
        backgroundStyle ?? null,
        backgroundCss ?? null,
        backgroundImgUrl ?? null,
        row.id,
      ]
    );

    await deleteOldStoreFile(logoUrl, row.logo_url);
    await deleteOldStoreFile(backgroundImgUrl, row.background_img_url);

    return ok(updated.rows[0]);
  } catch (error) {
    console.error("POST Store Settings Error:", error);
    return fail("INTERNAL_ERROR", 500);
  }


}

async function deleteOldStoreFile(newUrl: string | undefined, oldUrl: string | null | undefined) {
  if (!newUrl || !oldUrl || newUrl === oldUrl) return;
  if (!oldUrl.startsWith("/uploads/store/")) return;

  try {
    var oldPath = path.join(process.cwd(), "public", oldUrl.replace(/^\/+/, ""));
    await unlink(oldPath);
  } catch {
    // arquivo antigo já não existe ou não pôde ser removido — ignora
  }
}