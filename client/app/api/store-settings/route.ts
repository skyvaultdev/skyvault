"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

async function ensureSchema() {
  const db = getDB();
  await db.query(`
    CREATE TABLE IF NOT EXISTS store_settings (
      id BIGINT PRIMARY KEY,
      primary_color TEXT NOT NULL DEFAULT '#b700ff',
      secondary_color TEXT NOT NULL DEFAULT '#6400ff',
      logo_url TEXT,
      background_style TEXT,
      background_img_url TEXT,
      background_css TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    INSERT INTO store_settings (id, primary_color, secondary_color)
    VALUES (1, '#b700ff', '#6400ff')
    ON CONFLICT (id) DO NOTHING
  `);

  return db;
}

export async function GET() {
  try {
    const db = await ensureSchema();
    const result = await db.query("SELECT * FROM store_settings WHERE id = 1");
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
      primaryColor = String(form.get("primaryColor") ?? "") || undefined;
      secondaryColor = String(form.get("secondaryColor") ?? "") || undefined;
      backgroundStyle = String(form.get("backgroundStyle") ?? "") || undefined;
      backgroundCss = String(form.get("backgroundCss") ?? "") || undefined;

      const image = form.get("backgroundImage") as File | null;
      if (image && image.size > 0 && image.type.startsWith("image/")) {
        const uploadDir = path.join(process.cwd(), "public/uploads");
        await mkdir(uploadDir, { recursive: true });
        const fileName = `${crypto.randomUUID()}${path.extname(image.name || ".jpg")}`;
        await writeFile(path.join(uploadDir, fileName), Buffer.from(await image.arrayBuffer()));
        backgroundImgUrl = `/public/uploads/${fileName}`;
      }
    } else {
      const body = (await req.json()) as {
        primaryColor?: string;
        secondaryColor?: string;
        backgroundStyle?: string;
        backgroundCss?: string;
        backgroundImgUrl?: string;
      };
      primaryColor = body.primaryColor;
      secondaryColor = body.secondaryColor;
      backgroundStyle = body.backgroundStyle;
      backgroundCss = body.backgroundCss;
      backgroundImgUrl = body.backgroundImgUrl;
    }

    const current = await db.query("SELECT * FROM store_settings WHERE id = 1");
    const row = current.rows[0];

    const updated = await db.query(
      `UPDATE store_settings
       SET primary_color=$1, secondary_color=$2, background_style=$3, background_css=$4, background_img_url=$5, updated_at=NOW()
       WHERE id=1
       RETURNING *`,
      [
        primaryColor ?? row.primary_color,
        secondaryColor ?? row.secondary_color,
        backgroundStyle ?? row.background_style,
        backgroundCss ?? row.background_css,
        backgroundImgUrl ?? row.background_img_url,
      ]
    );

    return ok(updated.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
