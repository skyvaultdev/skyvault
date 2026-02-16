"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";


export async function GET() {
  try {
    const db = getDB();
    const result = await db.query("SELECT id, email FROM admin ORDER BY email ASC");

    return ok(result.rows);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);

  }
}
