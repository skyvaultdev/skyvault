"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { requireCustomer } from "@/lib/auth/customer";

type Params = { params: Promise<{ id: string }> };

// Cancelamento pelo próprio cliente — só de pedido AINDA não pago. Nunca
// debitou estoque nem criou envio, então é só fechar o pedido, sem
// restock nem nada pra desfazer (diferente do cancelamento de um pedido
// já pago, que é ação de staff em /api/admin/orders/[id]).
export async function PATCH(_req: Request, { params }: Params) {
  const { userId, denied } = await requireCustomer();
  if (denied) return denied;

  const { id } = await params;
  const orderId = Number(id);
  if (!orderId) return NextResponse.json({ error: "INVALID_ORDER_ID" }, { status: 400 });

  const db = getDB();
  const result = await db.query(
    `UPDATE orders SET status = 'cancelled'
     WHERE id = $1 AND user_id = $2 AND status = 'pending_payment'
     RETURNING id`,
    [orderId, userId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "ORDER_NOT_FOUND_OR_NOT_PENDING" }, { status: 404 });
  }

  return NextResponse.json({ data: { cancelled: true } });
}
