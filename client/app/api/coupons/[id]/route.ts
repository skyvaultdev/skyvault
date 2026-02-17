"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    const db = getDB();
    const result = await db.query("SELECT * FROM coupons WHERE id = $1", [Number(id)]);
    if (result.rows.length === 0) return fail("NOT_FOUND", 404);
    return ok(result.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const db = getDB();
    const body = (await req.json()) as {
      code?: string;
      percentOff?: number;
      usageLimit?: number;
      usedCount?: number;
      minOrderValue?: number | null;
      active?: boolean;
      expiresAt?: string | null;
    };

    const current = await db.query("SELECT * FROM coupons WHERE id = $1", [Number(id)]);
    if (current.rows.length === 0) return fail("NOT_FOUND", 404);
    const row = current.rows[0];

    const result = await db.query(
      `UPDATE coupons SET code=$1, percent_off=$2, usage_limit=$3, used_count=$4, min_order_value=$5, active=$6, expires_at=$7
       WHERE id=$8 RETURNING *`,
      [
        body.code?.trim().toUpperCase() || row.code,
        body.percentOff ?? row.percent_off,
        body.usageLimit ?? row.usage_limit,
        body.usedCount ?? row.used_count,
        body.minOrderValue ?? row.min_order_value,
        body.active ?? row.active,
        body.expiresAt ?? row.expires_at,
        Number(id),
      ]
    );

    return ok(result.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function PUT(req: Request, ctx: Params) {
  return PATCH(req, ctx);
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    const db = getDB();
    const result = await db.query("DELETE FROM coupons WHERE id=$1 RETURNING id", [Number(id)]);
    if (result.rows.length === 0) return fail("NOT_FOUND", 404);
    return ok(result.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
