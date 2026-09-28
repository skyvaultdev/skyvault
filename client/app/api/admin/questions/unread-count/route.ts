"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { ensureQuestionsTable } from "@/lib/questions/ensureQuestionsTable";

// Quantas perguntas pedem atenção da equipe (sem resposta ou com nova
// mensagem do cliente ainda não lida) — alimenta o selo da barra lateral.
export async function GET() {
  try {
    const { denied } = await requirePermission("products.write");
    if (denied) return denied;
    await ensureQuestionsTable();
    const res = await getDB().query(`SELECT COUNT(*) AS n FROM product_questions WHERE staff_unread = TRUE AND hidden = false`);
    return ok({ count: Number(res.rows[0].n) });
  } catch (error) {
    console.error("Erro ao contar perguntas:", error);
    return fail("QUESTIONS_COUNT_ERROR", 500);
  }
}
