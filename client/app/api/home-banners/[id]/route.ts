"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const db = getDB();
  const result = await db.query("SELECT * FROM home_banners WHERE id = $1", [Number(id)]);
  if (result.rows.length === 0) return fail("NOT_FOUND", 404);
  return ok(result.rows[0]);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = (await req.json()) as {
    title?: string;
    subtitle?: string | null;
    imageUrl?: string;
    link?: string | null;
    active?: boolean;
    position?: number;
  };

  const db = getDB();
  const current = await db.query("SELECT * FROM home_banners WHERE id = $1", [Number(id)]);
  if (current.rows.length === 0) return fail("NOT_FOUND", 404);

  const row = current.rows[0];
  const result = await db.query(
    `UPDATE home_banners SET title=$1, subtitle=$2, image_url=$3, link=$4, active=$5, position=$6 WHERE id=$7 RETURNING *`,
    [
      body.title ?? row.title,
      body.subtitle ?? row.subtitle,
      body.imageUrl ?? row.image_url,
      body.link ?? row.link,
      body.active ?? row.active,
      body.position ?? row.position,
      Number(id),
    ]
  );

  return ok(result.rows[0]);
}

export async function PUT(req: Request, ctx: Params) {
  return PATCH(req, ctx);
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  const db = getDB();
  const result = await db.query("DELETE FROM home_banners WHERE id = $1 RETURNING id", [Number(id)]);
  if (result.rows.length === 0) return fail("NOT_FOUND", 404);
  return ok(result.rows[0]);
}
