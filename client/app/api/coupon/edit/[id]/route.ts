"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { ensureTeamTables, logTeamAction } from "@/lib/team/team";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { session, denied } = await requirePermission("products.write");
    if (denied) return denied;
    await ensureTeamTables();

    var { id } = await params;
    const db = getDB();
    var body = (await req.json()) as {
      code?: string;
      percentOff?: number;
      usageLimit?: number;
      perUserLimit?: number;
      usedCount?: number;
      minOrderValue?: number | null;
      active?: boolean;
      expiresAt?: string | null;
    };

    const current = await db.query("SELECT * FROM coupons WHERE id = $1", [Number(id)]);
    if (current.rows.length === 0) return fail("NOT_FOUND", 404);
    var row = current.rows[0];

    const result = await db.query(
      `UPDATE coupons SET code = $1, percent_off = $2, usage_limit = $3, per_user_limit = $4, used_count = $5, min_order_value = $6, active = $7, expires_at = $8
       WHERE id=$9 RETURNING *`,
      [
        body.code?.trim().toUpperCase() || row.code,
        body.percentOff ?? row.percent_off,
        body.usageLimit ?? row.usage_limit,
        body.perUserLimit ?? row.per_user_limit,
        body.usedCount ?? row.used_count,
        body.minOrderValue ?? row.min_order_value,
        body.active ?? row.active,
        body.expiresAt ?? row.expires_at,
        Number(id),
      ]
    );

    await logTeamAction(db, session?.email ?? "desconhecido", "coupon.update", result.rows[0].code, {
      percentOff: result.rows[0].percent_off,
      usageLimit: result.rows[0].usage_limit,
      active: result.rows[0].active,
    });

    return ok(result.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function PUT(req: Request, ctx: Params) {
  return PATCH(req, ctx);
}