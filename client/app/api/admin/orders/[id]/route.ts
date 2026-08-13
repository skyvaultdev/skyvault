"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { denied } = await requirePermission("orders.read");
    if (denied) return denied;

    const { id } = await params;
    const orderId = Number(id);
    if (!orderId) return fail("INVALID_ORDER_ID", 400);

    const db = getDB();
    const orderRes = await db.query(
      `SELECT o.*, u.email AS customer_email
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = $1`,
      [orderId]
    );
    if (orderRes.rows.length === 0) return fail("ORDER_NOT_FOUND", 404);
    const order = orderRes.rows[0];

    const [itemsRes, addressRes, txRes, shipmentRes] = await Promise.all([
      db.query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC`, [orderId]),
      order.shipping_address_id
        ? db.query(`SELECT * FROM shipping_addresses WHERE id = $1`, [order.shipping_address_id])
        : Promise.resolve({ rows: [] }),
      db.query(`SELECT * FROM payment_transactions WHERE order_id = $1 ORDER BY created_at DESC`, [orderId]),
      db.query(
        `SELECT s.*, c.name AS carrier_name FROM shipments s LEFT JOIN carriers c ON c.id = s.carrier_id WHERE s.order_id = $1`,
        [orderId]
      ),
    ]);

    return ok({
      ...order,
      items: itemsRes.rows,
      shippingAddress: addressRes.rows[0] ?? null,
      paymentTransactions: txRes.rows,
      shipment: shipmentRes.rows[0] ?? null,
    });
  } catch (error) {
    console.error("Erro ao buscar pedido:", error);
    return fail("ORDER_FETCH_ERROR", 500);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { denied } = await requirePermission("orders.manage");
    if (denied) return denied;

    const { id } = await params;
    const orderId = Number(id);
    if (!orderId) return fail("INVALID_ORDER_ID", 400);

    const body = await req.json();
    const db = getDB();

    if (body.status) {
      await db.query(`UPDATE orders SET status = $1 WHERE id = $2`, [body.status, orderId]);
    }

    if (body.trackingCode !== undefined || body.shipmentStatus) {
      const existing = await db.query(`SELECT id FROM shipments WHERE order_id = $1`, [orderId]);
      if (existing.rows.length > 0) {
        await db.query(
          `UPDATE shipments
           SET tracking_code = COALESCE($1, tracking_code),
               status = COALESCE($2, status),
               shipped_at = CASE WHEN $2 = 'posted' AND shipped_at IS NULL THEN NOW() ELSE shipped_at END,
               delivered_at = CASE WHEN $2 = 'delivered' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END
           WHERE order_id = $3`,
          [body.trackingCode ?? null, body.shipmentStatus ?? null, orderId]
        );
      } else {
        await db.query(
          `INSERT INTO shipments (order_id, tracking_code, status) VALUES ($1, $2, COALESCE($3, 'preparing'))`,
          [orderId, body.trackingCode ?? null, body.shipmentStatus ?? null]
        );
      }
    }

    return ok({ updated: true });
  } catch (error) {
    console.error("Erro ao atualizar pedido:", error);
    return fail("ORDER_UPDATE_ERROR", 500);
  }
}
