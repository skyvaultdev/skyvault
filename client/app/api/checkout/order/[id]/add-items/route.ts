"use server";

import { NextResponse } from "next/server";
import { getDB, withTransaction } from "@/lib/database/db";
import { requireCustomer } from "@/lib/auth/customer";
import { getDiscountAmount } from "@/lib/pricing/cartDiscount";
import { loadPromotionSettings } from "@/lib/pricing/promotionSettings";

type Params = { params: Promise<{ id: string }> };

// Junta o carrinho atual a um pedido pendente já existente, em vez de criar
// um pedido novo separado — evita o cliente acumular vários
// pending_payment quando volta pro checkout depois de já ter criado um e
// resolvido continuar comprando. Recalcula subtotal/desconto com os itens
// somados; o frete já cotado no pedido original NÃO é recalculado (o
// cliente não escolheu uma transportadora nova pro peso/volume extra) —
// fica documentado aqui e avisado pro cliente na tela.
export async function POST(_req: Request, { params }: Params) {
  const { userId, denied } = await requireCustomer();
  if (denied) return denied;

  const { id } = await params;
  const orderId = Number(id);
  if (!orderId) return NextResponse.json({ error: "INVALID_ORDER_ID" }, { status: 400 });

  const db = getDB();
  const orderRes = await db.query(
    `SELECT id, shipping_fee FROM orders WHERE id = $1 AND user_id = $2 AND status = 'pending_payment'`,
    [orderId, userId]
  );
  const order = orderRes.rows[0];
  if (!order) return NextResponse.json({ error: "ORDER_NOT_FOUND_OR_NOT_PENDING" }, { status: 404 });

  const cartRes = await db.query(
    `SELECT
       c.quantity,
       p.id AS product_id, p.name AS product_name, p.product_type,
       v.id AS variation_id, v.name AS variation_name,
       COALESCE(v.price, p.price) AS unit_price,
       COALESCE(v.stock_count, p.stock_count) AS stock_count,
       COALESCE(v.is_unlimited, p.is_unlimited) AS is_unlimited
     FROM cart_items c
     JOIN products p ON p.id = c.product_id
     LEFT JOIN product_variations v ON v.id = c.variation_id
     WHERE c.user_id = $1`,
    [userId]
  );
  if (cartRes.rows.length === 0) return NextResponse.json({ error: "EMPTY_CART" }, { status: 400 });

  for (const row of cartRes.rows) {
    if (!row.is_unlimited && Number(row.stock_count) < row.quantity) {
      return NextResponse.json({ error: `OUT_OF_STOCK:${row.product_name}` }, { status: 409 });
    }
  }

  const promotionSettings = await loadPromotionSettings();

  const updated = await withTransaction(async (client) => {
    for (const row of cartRes.rows) {
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, variation_id, product_name, variation_name, quantity, unit_price, product_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [orderId, row.product_id, row.variation_id, row.product_name, row.variation_name, row.quantity, row.unit_price, row.product_type]
      );
    }

    const allItemsRes = await client.query(
      `SELECT quantity, unit_price FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    const subtotal = allItemsRes.rows.reduce((sum, r) => sum + Number(r.unit_price) * r.quantity, 0);
    const discount = getDiscountAmount(subtotal, promotionSettings.discountTiers);
    const shippingFee = Number(order.shipping_fee ?? 0);
    const total = Math.round((subtotal - discount + shippingFee) * 100) / 100;

    const result = await client.query(
      `UPDATE orders SET subtotal = $1, discount = $2, total = $3 WHERE id = $4 RETURNING id, total`,
      [subtotal, discount, total, orderId]
    );

    await client.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);

    return result.rows[0];
  });

  return NextResponse.json({ data: { orderId: updated.id, total: Number(updated.total) } });
}
