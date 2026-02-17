"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

export async function GET() {
  try {
    const db = getDB();
    const result = await db.query("SELECT * FROM home_banners ORDER BY position ASC, id DESC");
    return ok(result.rows);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: string;
      subtitle?: string | null;
      imageUrl?: string;
      link?: string | null;
      active?: boolean;
      position?: number;
    };
    if (!body.title || !body.imageUrl) return fail("MISSING_FIELDS", 400);

    const db = getDB();
    const result = await db.query(
      `INSERT INTO home_banners (title, subtitle, image_url, link, active, position)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [body.title, body.subtitle ?? null, body.imageUrl, body.link ?? null, body.active ?? true, body.position ?? 0]
    );

    return ok(result.rows[0], 201);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
