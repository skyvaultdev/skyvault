"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

export async function GET() {
  try {
    const { denied } = await requirePermission("shipping.manage");
    if (denied) return denied;

    const db = getDB();
    const result = await db.query(`SELECT * FROM carriers ORDER BY name ASC`);
    return ok(result.rows);
  } catch (error) {
    console.error("Erro ao listar transportadoras:", error);
    return fail("CARRIERS_LIST_ERROR", 500);
  }
}
