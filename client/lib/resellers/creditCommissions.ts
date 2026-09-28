import type { Pool, PoolClient } from "pg";

export type CommissionableItem = {
  id: number;
  product_id: number | null;
  quantity: number;
  unit_price: number | string;
  product_name: string;
};

// Chamado de dentro da MESMA transação de confirmOrderPayment — se
// alguma comissão falhar em gravar, a confirmação inteira (estoque,
// entrega) tem que dar rollback junto, senão o pedido fica "entregue" sem
// o revendedor ter sido creditado. Só credita produtos que o revendedor
// está especificamente autorizado a vender (reseller_products) — a
// aprovação geral do revendedor não libera comissão em produto nenhum
// sozinha.
export async function creditResellerCommissions(
  client: Pool | PoolClient,
  orderId: number,
  resellerId: number,
  items: CommissionableItem[]
) {
  const resellerRes = await client.query(`SELECT status FROM resellers WHERE id = $1`, [resellerId]);
  if (resellerRes.rows[0]?.status !== "approved") return;

  for (const item of items) {
    if (!item.product_id) continue;

    const authRes = await client.query(
      `SELECT commission_percent FROM reseller_products WHERE reseller_id = $1 AND product_id = $2`,
      [resellerId, item.product_id]
    );
    if (authRes.rows.length === 0) continue; // revendedor não autorizado pra esse produto — sem comissão

    const commissionPercent = Number(authRes.rows[0].commission_percent);
    const saleAmount = Math.round(Number(item.unit_price) * item.quantity * 100) / 100;
    const commissionAmount = Math.round(saleAmount * (commissionPercent / 100) * 100) / 100;

    await client.query(
      `INSERT INTO reseller_commissions
         (reseller_id, order_id, order_item_id, product_id, product_name, sale_amount, commission_percent, commission_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING`,
      [resellerId, orderId, item.id, item.product_id, item.product_name, saleAmount, commissionPercent, commissionAmount]
    );
  }
}

// Cancelamento/reembolso de pedido depois que a comissão já foi
// confirmada — cancela só comissões ainda não pagas (payout já feito não
// é revertido automaticamente, fica pro owner reconciliar manualmente,
// mesmo princípio já usado em delivery_failures/stockShortages).
export async function cancelResellerCommissionsForOrder(client: Pool | PoolClient, orderId: number) {
  await client.query(
    `UPDATE reseller_commissions SET status = 'cancelled' WHERE order_id = $1 AND status = 'confirmed'`,
    [orderId]
  );
}
