"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    var { id } = await params;
    const db = getDB();
    const result = await db.query("SELECT * FROM coupons WHERE id = $1", [Number(id)]);
    if (result.rows.length === 0) return fail("NOT_FOUND", 404);
    return ok(result.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
