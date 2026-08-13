"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

export async function GET() {
  try {
    const { denied } = await requirePermission("team.manage");
    if (denied) return denied;

    const db = getDB();
    const result = await db.query("SELECT id, email, role FROM admin ORDER BY email ASC");
    return ok(result.rows);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}