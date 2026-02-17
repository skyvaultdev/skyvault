"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

async function ensureSchema() {
  const db = getDB();

  // 1) garante a tabela (pra instalações novas)
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

  // 2) migração pra bancos antigos: adiciona colunas que podem não existir
  await db.query(`ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#b700ff'`);
  await db.query(`ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS secondary_color TEXT NOT NULL DEFAULT '#6400ff'`);
  await db.query(`ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS logo_url TEXT`);
  await db.query(`ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS background_style TEXT`);
  await db.query(`ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS background_img_url TEXT`);
  await db.query(`ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS background_css TEXT`);
  await db.query(`ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

  // 3) garante 1 linha (sem setar id)
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

    // pega a linha mais recente (singleton prático)
    const result = await db.query(`
      SELECT *
      FROM store_settings
      ORDER BY id DESC
      LIMIT 1
    `);

    return ok(result.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const db = await ensureSchema();
    const contentType = req.headers.get("content-type") ?? "";

    let primaryColor: string | undefined;
    let secondaryColor: string | undefined;
    let backgroundStyle: string | undefined;
    let backgroundCss: string | undefined;
    let backgroundImgUrl: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();

      primaryColor = String(form.get("primaryColor") ?? "").trim() || undefined;
      secondaryColor = String(form.get("secondaryColor") ?? "").trim() || undefined;
      backgroundStyle = String(form.get("backgroundStyle") ?? "").trim() || undefined;
      backgroundCss = String(form.get("backgroundCss") ?? "") || undefined;

      const image = form.get("backgroundImage");
      if (image instanceof File && image.size > 0 && image.type.startsWith("image/")) {
        const uploadDir = path.join(process.cwd(), "public/uploads");
        await mkdir(uploadDir, { recursive: true });

        const ext = path.extname(image.name || ".jpg") || ".jpg";
        const fileName = `${crypto.randomUUID()}${ext}`;
        const filePath = path.join(uploadDir, fileName);

        const bytes = Buffer.from(await image.arrayBuffer());
        await writeFile(filePath, bytes);

        // URL pública SEM /public
        backgroundImgUrl = `/uploads/${fileName}`;
      }
    } else {
      const body = (await req.json()) as {
        primaryColor?: string;
        secondaryColor?: string;
        backgroundStyle?: string;
        backgroundCss?: string;
        backgroundImgUrl?: string;
      };

      primaryColor = body.primaryColor?.trim() || undefined;
      secondaryColor = body.secondaryColor?.trim() || undefined;
      backgroundStyle = body.backgroundStyle?.trim() || undefined;
      backgroundCss = body.backgroundCss || undefined;
      backgroundImgUrl = body.backgroundImgUrl?.trim() || undefined;
    }

    const current = await db.query(`
      SELECT *
      FROM store_settings
      ORDER BY id DESC
      LIMIT 1
    `);

    const row = current.rows[0];
    if (!row) return fail("STORE_SETTINGS_NOT_FOUND", 404);

    const updated = await db.query(
      `
      UPDATE store_settings
      SET
        primary_color = $1,
        secondary_color = $2,
        background_style = $3,
        background_css = $4,
        background_img_url = $5,
        updated_at = NOW()
      WHERE id = $6
      RETURNING *
      `,
      [
        primaryColor ?? row.primary_color,
        secondaryColor ?? row.secondary_color,
        backgroundStyle ?? row.background_style,
        backgroundCss ?? row.background_css,
        backgroundImgUrl ?? row.background_img_url,
        row.id,
      ]
    );

    return ok(updated.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}