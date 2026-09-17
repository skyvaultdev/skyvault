"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const { id } = await params;
    const orderId = Number(id);
    if (!orderId) return fail("INVALID_ORDER_ID", 400);

    const db = getDB();
    const orderRes = await db.query(`SELECT * FROM orders WHERE id = $1 AND user_id = $2`, [orderId, userId]);
    if (orderRes.rows.length === 0) return fail("ORDER_NOT_FOUND", 404);

    const itemsRes = await db.query(
      `SELECT
         oi.*,
         p.slug AS product_slug,
         cat.name AS category_name,
         (SELECT url FROM product_images pi WHERE pi.product_id = oi.product_id ORDER BY position ASC LIMIT 1) AS image_url
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories cat ON cat.id = p.category_id
       WHERE oi.order_id = $1
       ORDER BY oi.id ASC`,
      [orderId]
    );

    const items = [];
    for (const item of itemsRes.rows) {
      let deliveredContent: string[] | null = null;

      if (item.delivered_at && item.product_type === "digital") {
        const isVariation = item.variation_id != null;
        const table = isVariation ? "product_variations" : "products";
        const targetId = isVariation ? item.variation_id : item.product_id;

        if (targetId) {
          const infoRes = await db.query(`SELECT stock_type, stock_content FROM ${table} WHERE id = $1`, [targetId]);
          const info = infoRes.rows[0];

          if (info?.stock_type === "key") {
            const keyColumn = isVariation ? "variation_id" : "product_id";
            const keysRes = await db.query(
              `SELECT key_content FROM stock_keys WHERE order_id = $1 AND ${keyColumn} = $2`,
              [orderId, targetId]
            );
            deliveredContent = keysRes.rows.map((r) => r.key_content);
          } else if (info?.stock_type === "file") {
            deliveredContent = [`/api/files/products/uploads/${info.stock_content}`];
          } else if (info) {
            deliveredContent = [info.stock_content || "Entrega automática ativada"];
          }
        }
      }

      items.push({ ...item, deliveredContent });
    }

    const order = orderRes.rows[0];

    const [addressRes, shipmentRes] = await Promise.all([
      order.shipping_address_id
        ? db.query(`SELECT * FROM shipping_addresses WHERE id = $1`, [order.shipping_address_id])
        : Promise.resolve({ rows: [] }),
      db.query(
        `SELECT s.*, c.name AS carrier_name FROM shipments s LEFT JOIN carriers c ON c.id = s.carrier_id WHERE s.order_id = $1`,
        [orderId]
      ),
    ]);

    const shipment = shipmentRes.rows[0] ?? null;
    const eventsRes = shipment
      ? await db.query(`SELECT * FROM shipment_events WHERE shipment_id = $1 ORDER BY created_at ASC`, [shipment.id])
      : { rows: [] };

    return ok({
      ...order,
      items,
      shippingAddress: addressRes.rows[0] ?? null,
      shipment,
      shipmentEvents: eventsRes.rows,
    });
  } catch (error) {
    console.error("Erro ao buscar pedido:", error);
    return fail("ORDER_FETCH_ERROR", 500);
  }
}
