import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";

async function ensureSchema() {
  const db = await getDB();

  await db.query(`
    CREATE TABLE IF NOT EXISTS store_settings (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      primary_color TEXT,
      secondary_color TEXT,
      logo_url TEXT,
      background_style TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    INSERT INTO store_settings DEFAULT VALUES
    ON CONFLICT DO NOTHING;
  `);
}

export async function GET() {
  try {
    await ensureSchema();
    const db = await getDB();

    const res = await db.query(`
      SELECT id, primary_color, secondary_color, logo_url, background_style, updated_at
      FROM store_settings
      ORDER BY id ASC
      LIMIT 1
    `);

    return NextResponse.json(res.rows[0] ?? null);
  } catch (err) {
    console.error("STORE_SETTINGS_GET_ERROR:", err);
    return NextResponse.json({ error: "STORE_SETTINGS_ERROR" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const db = await getDB();

    const body = await req.json().catch(() => ({}));
    const primary_color =
      typeof body.primary_color === "string" ? body.primary_color : null;
    const secondary_color =
      typeof body.secondary_color === "string" ? body.secondary_color : null;
    const logo_url = typeof body.logo_url === "string" ? body.logo_url : null;
    const background_style =
      typeof body.background_style === "string" ? body.background_style : null;

    const current = await db.query(
      `SELECT id FROM store_settings ORDER BY id ASC LIMIT 1`
    );
    const id = Number(current.rows[0]?.id);

    await db.query(
      `
      UPDATE store_settings
      SET primary_color = $1,
          secondary_color = $2,
          logo_url = $3,
          background_style = $4,
          updated_at = NOW()
      WHERE id = $5
      `,
      [primary_color, secondary_color, logo_url, background_style, id]
    );

    const out = await db.query(
      `
      SELECT id, primary_color, secondary_color, logo_url, background_style, updated_at
      FROM store_settings
      WHERE id = $1
      `,
      [id]
    );

    return NextResponse.json(out.rows[0] ?? null);
  } catch (err) {
    console.error("STORE_SETTINGS_POST_ERROR:", err);
    return NextResponse.json({ error: "STORE_SETTINGS_ERROR" }, { status: 500 });
  }
}