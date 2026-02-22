"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";

export async function GET(req: Request) {
  try {
    const db = getDB();
    const result = await db.query(`SELECT product_id, name, price, position FROM product_variations`,)
    if (result.rows.length === 0) return fail("NOT_FOUND", 404);
    
    return ok({ ...result.rows });
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}