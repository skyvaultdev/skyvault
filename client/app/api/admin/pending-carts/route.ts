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
         MAX(c.updated_at) AS last_updated,
         json_agg(
           json_build_object(
             'productName', p.name,
             'variationName', v.name,
             'quantity', c.quantity,
             'unitPrice', COALESCE(v.price, p.price),
             'productType', p.product_type
           )
           ORDER BY c.updated_at DESC
         ) AS items
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

// Esvazia o carrinho de um cliente específico — útil pra limpar um
// carrinho abandonado (ex: cliente pediu pra cancelar, ou é claramente
// spam/teste). Não existe "pedido" nenhum aqui ainda (cart_items não virou
// order), então não tem nada pra reembolsar/restocar — é só um DELETE.
export async function DELETE(req: Request) {
  try {
    const { denied } = await requirePermission("orders.manage");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email")?.trim();
    if (!email) return fail("MISSING_EMAIL", 400);

    const db = getDB();
    const userRes = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (userRes.rows.length === 0) return fail("USER_NOT_FOUND", 404);

    await db.query(`DELETE FROM cart_items WHERE user_id = $1`, [userRes.rows[0].id]);

    return ok({ cleared: true });
  } catch (error) {
    console.error("Erro ao cancelar carrinho pendente:", error);
    return fail("PENDING_CART_CANCEL_ERROR", 500);
  }
}
