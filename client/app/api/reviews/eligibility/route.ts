"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { ensureReviewsTable } from "@/lib/reviews/ensureReviewsTable";

// Diz, pra uma lista de produtos, quais o cliente logado já avaliou — usado
// em "Meus pedidos" pra o modal saber se mostra "Avaliar" ou "Já avaliado".
export async function GET(req: Request) {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const ids = (new URL(req.url).searchParams.get("productIds") ?? "")
      .split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
    if (ids.length === 0) return ok({ reviewed: [] });

    await ensureReviewsTable();
    const res = await getDB().query(
      `SELECT product_id FROM product_reviews WHERE user_id = $1 AND product_id = ANY($2)`,
      [userId, ids]
    );
    return ok({ reviewed: res.rows.map((r) => Number(r.product_id)) });
  } catch (error) {
    console.error("Erro ao checar avaliações:", error);
    return fail("REVIEW_ELIGIBILITY_ERROR", 500);
  }
}
