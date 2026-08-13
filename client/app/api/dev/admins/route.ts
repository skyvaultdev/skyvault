"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireDev } from "@/lib/devAuth/guard";

export async function GET() {
  try {
    const { denied } = await requireDev();
    if (denied) return denied;

    const db = getDB();
    const result = await db.query(`SELECT id, email, role, blocked FROM admin ORDER BY role ASC, email ASC`);

    return ok(result.rows);
  } catch (error) {
    console.error("Erro ao listar donos/equipe da loja:", error);
    return fail("ADMINS_LIST_ERROR", 500);
  }
}
