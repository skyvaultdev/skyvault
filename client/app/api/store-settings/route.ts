"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

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
    "logo_url TEXT",
    "background_style TEXT",
    "background_img_url TEXT",
    "background_css TEXT",
    "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
  ];

  for (const col of columns) {
    const colName = col.split(" ")[0];
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
    const db = await ensureSchema();
    const contentType = req.headers.get("content-type") ?? "";

    let primaryColor: string | undefined;
    let secondaryColor: string | undefined;
    let backgroundStyle: string | undefined;
    let backgroundCss: string | undefined;
    let backgroundImgUrl: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();

      primaryColor = form.get("primaryColor")?.toString().trim() || undefined;
      secondaryColor = form.get("secondaryColor")?.toString().trim() || undefined;
      backgroundStyle = form.get("backgroundStyle")?.toString().trim() || undefined;
      backgroundCss = form.get("backgroundCss")?.toString() || undefined;

      const image = form.get("backgroundImage");
      
      if (image instanceof File && image.size > 0) {
        const uploadDir = path.join(process.cwd(), "public", "store");
        await mkdir(uploadDir, { recursive: true });

        const ext = path.extname(image.name) || ".jpg";
        const fileName = `${crypto.randomUUID()}${ext}`;
        const filePath = path.join(uploadDir, fileName);

        const bytes = Buffer.from(await image.arrayBuffer());
        await writeFile(filePath, bytes);

        backgroundImgUrl = `/store/${fileName}`;
      }
    } else {
      const body = await req.json();

      primaryColor = body.primaryColor?.trim();
      secondaryColor = body.secondaryColor?.trim();
      backgroundStyle = body.backgroundStyle?.trim();
      backgroundCss = body.backgroundCss;
      backgroundImgUrl = body.backgroundImgUrl?.trim();
    }

    const current = await db.query(`
      SELECT * FROM store_settings ORDER BY id DESC LIMIT 1
    `);

    const row = current.rows[0];
    if (!row) return fail("STORE_SETTINGS_NOT_FOUND", 404);

    const updated = await db.query(
      `
      UPDATE store_settings
      SET
        primary_color = COALESCE($1, primary_color),
        secondary_color = COALESCE($2, secondary_color),
        background_style = COALESCE($3, background_style),
        background_css = COALESCE($4, background_css),
        background_img_url = COALESCE($5, background_img_url),
        updated_at = NOW()
      WHERE id = $6
      RETURNING *
      `,
      [
        primaryColor ?? null,
        secondaryColor ?? null,
        backgroundStyle ?? null,
        backgroundCss ?? null,
        backgroundImgUrl ?? null,
        row.id,
      ]
    );

    return ok(updated.rows[0]);
  } catch (error) {
    console.error("POST Store Settings Error:", error);
    return fail("INTERNAL_ERROR", 500);
  }
}