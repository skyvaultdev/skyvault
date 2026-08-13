"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

export async function POST(req: Request) {
  try {
    const { denied } = await requirePermission("shipping.manage");
    if (denied) return denied;

    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const serviceCode = String(body.serviceCode ?? "").trim() || null;
    const active = body.active !== false;

    if (!name) return fail("MISSING_NAME", 400);

    const db = getDB();
    const result = await db.query(
      `INSERT INTO carriers (name, service_code, active) VALUES ($1, $2, $3) RETURNING *`,
      [name, serviceCode, active]
    );

    return ok(result.rows[0], 201);
  } catch (error) {
    console.error("Erro ao criar transportadora:", error);
    return fail("CARRIER_ADD_ERROR", 500);
  }
}
