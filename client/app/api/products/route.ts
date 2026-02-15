"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");

    const db = await getDB();
    await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS position INT");

    if (name && name.trim().length > 0) {
      const prefix = name.trim().slice(0, 3);
      const result = await db.query(`SELECT id,name,slug,position FROM products WHERE name ILIKE $1 ORDER BY name ASC LIMIT 10`,
        [`${prefix}%`]
      );

      return NextResponse.json({
        ok: true,
        product: result.rows,
      });
    }

    const result = await db.query(`SELECT * FROM products ORDER BY COALESCE(position, 2147483647), created_at LIMIT 50`);
    return NextResponse.json({
      ok: true,
      product: result.rows,
    });

  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
