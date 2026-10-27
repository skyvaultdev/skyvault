"use server";

import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { ensureCouponsSchema } from "@/lib/coupons/ensureCouponsSchema";
import { ensureTeamTables, logTeamAction } from "@/lib/team/team";

export async function POST(req: Request) {
  try {
    const { session, denied } = await requirePermission("products.write");
    if (denied) return denied;
    await ensureTeamTables();

    const db = await ensureCouponsSchema();
    var body = (await req.json()) as {
      code?: string;
      percentOff?: number;
      usageLimit?: number;
      perUserLimit?: number;
      minOrderValue?: number | null;
      active?: boolean;
      expiresAt?: string | null;
    };

    if (!body.code || !Number.isFinite(body.percentOff)) return fail("MISSING_FIELDS", 400);

    const result = await db.query(
      `INSERT INTO coupons (code, percent_off, usage_limit, per_user_limit, min_order_value, active, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        body.code.trim().toUpperCase(),
        body.percentOff,
        body.usageLimit ?? 0,
        body.perUserLimit ?? 0,
        body.minOrderValue ?? null,
        body.active ?? true,
        body.expiresAt ?? null,
      ]
    );

    await logTeamAction(db, session?.email ?? "desconhecido", "coupon.create", result.rows[0].code, {
      percentOff: result.rows[0].percent_off,
      usageLimit: result.rows[0].usage_limit,
    });

    return ok(result.rows[0], 201);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
