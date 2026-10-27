"use server";

import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { ensureCouponsSchema } from "@/lib/coupons/ensureCouponsSchema";

export async function GET() {
  try {
    const { denied } = await requirePermission("products.write");
    if (denied) return denied;

    const db = await ensureCouponsSchema();
    const result = await db.query("SELECT * FROM coupons ORDER BY created_at DESC");
    return ok(result.rows);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
