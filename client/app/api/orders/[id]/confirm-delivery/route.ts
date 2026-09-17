"use server";

import { NextResponse } from "next/server";
import { getDB, withTransaction } from "@/lib/database/db";
import { requireCustomer } from "@/lib/auth/customer";

type Params = { params: Promise<{ id: string }> };

// Confirmação de entrega pelo próprio cliente (estilo SHEIN: "recebi meu
// pedido") — só faz sentido depois que o staff postou/colocou em trânsito;
// antes disso não tem o que confirmar, e um pedido já entregue ou
// cancelado não deveria voltar a mudar por aqui.
export async function PATCH(_req: Request, { params }: Params) {
  const { userId, denied } = await requireCustomer();
  if (denied) return denied;

  const { id } = await params;
  const orderId = Number(id);
  if (!orderId) return NextResponse.json({ error: "INVALID_ORDER_ID" }, { status: 400 });

  const db = getDB();
  const orderRes = await db.query(`SELECT id FROM orders WHERE id = $1 AND user_id = $2`, [orderId, userId]);
  if (orderRes.rows.length === 0) return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

  const shipRes = await db.query(`SELECT id, status FROM shipments WHERE order_id = $1`, [orderId]);
  const shipment = shipRes.rows[0];
  if (!shipment) return NextResponse.json({ error: "NO_SHIPMENT" }, { status: 409 });
  if (shipment.status === "delivered") return NextResponse.json({ data: { updated: false } });
  if (shipment.status !== "posted" && shipment.status !== "in_transit") {
    return NextResponse.json({ error: "NOT_SHIPPED_YET" }, { status: 409 });
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE shipments SET status = 'delivered', delivered_at = COALESCE(delivered_at, NOW()) WHERE id = $1`,
      [shipment.id]
    );
    await client.query(
      `INSERT INTO shipment_events (shipment_id, status, description) VALUES ($1, 'delivered', 'Confirmado pelo cliente')`,
      [shipment.id]
    );
    await client.query(`UPDATE orders SET status = 'delivered' WHERE id = $1`, [orderId]);
  });

  return NextResponse.json({ data: { updated: true } });
}
