"use server";

import { getDB } from "@/lib/database/db";
import { ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

// Chaves (licenças) já vendidas que vencem nos próximos 30 dias — pra o
// staff saber de antemão quais clientes podem procurar suporte perguntando
// "minha licença parou de funcionar" sem aviso prévio nenhum da loja.
export async function GET() {
  const { denied } = await requirePermission("products.write");
  if (denied) return denied;

  const db = getDB();
  const res = await db.query(
    `SELECT
       sk.id,
       sk.expires_at,
       sk.order_id,
       o.order_number,
       u.email AS customer_email,
       COALESCE(p.name, vp.name) AS product_name,
       v.name AS variation_name
     FROM stock_keys sk
     LEFT JOIN orders o ON o.id = sk.order_id
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN products p ON p.id = sk.product_id
     LEFT JOIN product_variations v ON v.id = sk.variation_id
     LEFT JOIN products vp ON vp.id = v.product_id
     WHERE sk.is_sold = true
       AND sk.expires_at IS NOT NULL
       AND sk.expires_at <= NOW() + INTERVAL '30 days'
     ORDER BY sk.expires_at ASC
     LIMIT 50`
  );

  return ok({ items: res.rows });
}
