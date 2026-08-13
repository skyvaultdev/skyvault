"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { denied } = await requirePermission("shipping.manage");
    if (denied) return denied;

    const { id } = await params;
    const carrierId = Number(id);
    if (!carrierId) return fail("INVALID_ID", 400);

    const db = getDB();
    const current = await db.query(`SELECT * FROM carriers WHERE id = $1`, [carrierId]);
    if (current.rows.length === 0) return fail("NOT_FOUND", 404);
    const row = current.rows[0];

    const body = await req.json();
    const name = body.name !== undefined ? String(body.name).trim() : row.name;
    const serviceCode = body.serviceCode !== undefined ? String(body.serviceCode).trim() || null : row.service_code;
    const active = body.active !== undefined ? Boolean(body.active) : row.active;

    const result = await db.query(
      `UPDATE carriers SET name = $1, service_code = $2, active = $3 WHERE id = $4 RETURNING *`,
      [name, serviceCode, active, carrierId]
    );

    return ok(result.rows[0]);
  } catch (error) {
    console.error("Erro ao editar transportadora:", error);
    return fail("CARRIER_EDIT_ERROR", 500);
  }
}

export async function PUT(req: Request, ctx: Params) {
  return PATCH(req, ctx);
}
