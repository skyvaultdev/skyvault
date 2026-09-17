"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";

// Sugestões simples de "compre também" pro carrinho do checkout: produtos
// da mesma categoria dos itens já no carrinho (prioridade) preenchido com
// os mais recentes da loja, sempre excluindo o que já está no carrinho.
// Nada de IA/coisa pesada — é só pra dar um empurrão de cross-sell na
// review do checkout.
export async function GET() {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const db = getDB();

    const cartRes = await db.query(
      `SELECT DISTINCT p.category_id, c.product_id
       FROM cart_items c
       JOIN products p ON p.id = c.product_id
       WHERE c.user_id = $1`,
      [userId]
    );

    if (cartRes.rows.length === 0) return ok([]);

    const cartProductIds = cartRes.rows.map((r) => r.product_id);
    const categoryIds = [...new Set(cartRes.rows.map((r) => r.category_id).filter(Boolean))];

    const result = await db.query(
      `SELECT
         p.id, p.slug, p.name, p.price,
         (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
       FROM products p
       WHERE p.id != ALL($1::bigint[])
         AND (p.is_unlimited = true OR p.stock_count > 0)
       ORDER BY (CASE WHEN p.category_id = ANY($2::bigint[]) THEN 0 ELSE 1 END), p.created_at DESC
       LIMIT 4`,
      [cartProductIds, categoryIds]
    );

    return ok(result.rows);
  } catch (error) {
    console.error("Erro ao buscar recomendações do checkout:", error);
    return fail("RECOMMENDATIONS_ERROR", 500);
  }
}
