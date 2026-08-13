"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

// "Carrinho pendente" não é uma tabela separada: cart_items só existe pra
// um usuário enquanto ele não finaliza um pedido (create-order apaga as
// linhas do carrinho ao criar o order) — então tudo que sobra aqui já É
// carrinho abandonado/pendente por definição.
export async function GET() {
  try {
    const { denied } = await requirePermission("orders.read");
    if (denied) return denied;

    const db = getDB();
    const result = await db.query(
      `SELECT
         u.email AS customer_email,
         COUNT(c.id) AS item_count,
         SUM(COALESCE(v.price, p.price) * c.quantity) AS cart_value,
         MAX(c.updated_at) AS last_updated
       FROM cart_items c
       JOIN users u ON u.id = c.user_id
       JOIN products p ON p.id = c.product_id
       LEFT JOIN product_variations v ON v.id = c.variation_id
       GROUP BY u.email
       ORDER BY last_updated DESC
       LIMIT 100`
    );

    return ok(result.rows);
  } catch (error) {
    console.error("Erro ao listar carrinhos pendentes:", error);
    return fail("PENDING_CARTS_ERROR", 500);
  }
}
