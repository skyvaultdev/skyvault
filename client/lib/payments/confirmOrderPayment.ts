import { withTransaction } from "@/lib/database/db";
import type { DeliveredDigitalItem } from "@/lib/mail/sendOrderDeliveryEmail";

export type ConfirmOrderPaymentResult = {
  alreadyProcessed: boolean;
  order: any;
  customerEmail: string | null;
  deliveredItems: DeliveredDigitalItem[];
  hasPhysical: boolean;
};

// Núcleo atômico da confirmação de pagamento — chamado tanto pelo endpoint
// de teste (mock-confirm-payment) quanto pelo webhook real da EfiBank (fase 5).
// Idempotente: se o pedido já está pago, não repete o débito de estoque nem
// o crédito no saldo (a EfiBank pode reenviar o mesmo webhook mais de uma vez).
export async function confirmOrderPayment(orderId: number): Promise<ConfirmOrderPaymentResult> {
  return withTransaction(async (client) => {
    const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (orderRes.rows.length === 0) {
      throw new Error("ORDER_NOT_FOUND");
    }
    const order = orderRes.rows[0];

    const emailRes = await client.query(`SELECT email FROM users WHERE id = $1`, [order.user_id]);
    const customerEmail = emailRes.rows[0]?.email ?? null;

    if (order.status === "paid" || order.status === "delivered") {
      return { alreadyProcessed: true, order, customerEmail, deliveredItems: [], hasPhysical: false };
    }

    await client.query(
      `UPDATE payment_transactions SET status = 'paid', updated_at = NOW() WHERE order_id = $1 AND status != 'paid'`,
      [orderId]
    );

    await client.query(`UPDATE orders SET status = 'paid', paid_at = NOW() WHERE id = $1`, [orderId]);

    const itemsRes = await client.query(`SELECT * FROM order_items WHERE order_id = $1`, [orderId]);

    const deliveredItems: DeliveredDigitalItem[] = [];
    let hasPhysical = false;

    for (const item of itemsRes.rows) {
      const isVariation = item.variation_id != null;
      const table = isVariation ? "product_variations" : "products";
      const targetId = isVariation ? item.variation_id : item.product_id;
      if (!targetId) continue; // produto/variação removido depois da compra

      const infoRes = await client.query(
        `SELECT stock_type, stock_content, is_unlimited FROM ${table} WHERE id = $1 FOR UPDATE`,
        [targetId]
      );
      if (infoRes.rows.length === 0) continue;
      const info = infoRes.rows[0];

      if (item.product_type === "physical") {
        hasPhysical = true;
        if (!info.is_unlimited) {
          await client.query(
            `UPDATE ${table} SET stock_count = GREATEST(stock_count - $1, 0) WHERE id = $2`,
            [item.quantity, targetId]
          );
        }
        continue;
      }

      // Digital: key/file/infinite. stock_count só é decrementado pra
      // file/infinite aqui — key tem sua própria contagem (linhas em
      // stock_keys) e é decrementada junto da reserva, abaixo.
      if (!info.is_unlimited && info.stock_type !== "key") {
        await client.query(
          `UPDATE ${table} SET stock_count = GREATEST(stock_count - $1, 0) WHERE id = $2`,
          [item.quantity, targetId]
        );
      }

      if (info.stock_type === "key") {
        const keyColumn = isVariation ? "variation_id" : "product_id";
        for (let i = 0; i < item.quantity; i++) {
          const keyRes = await client.query(
            `UPDATE stock_keys
             SET is_sold = true, order_id = $1, sold_at = NOW()
             WHERE id = (
               SELECT id FROM stock_keys
               WHERE ${keyColumn} = $2 AND is_sold = false
               LIMIT 1 FOR UPDATE SKIP LOCKED
             )
             RETURNING key_content`,
            [orderId, targetId]
          );
          if (keyRes.rows.length > 0) {
            deliveredItems.push({
              productName: item.product_name,
              variationName: item.variation_name,
              type: "key",
              content: keyRes.rows[0].key_content,
            });
          }
        }
        if (!info.is_unlimited) {
          await client.query(
            `UPDATE ${table} SET stock_count = GREATEST(stock_count - $1, 0) WHERE id = $2`,
            [item.quantity, targetId]
          );
        }
      } else if (info.stock_type === "file") {
        deliveredItems.push({
          productName: item.product_name,
          variationName: item.variation_name,
          type: "file",
          content: `/api/files/products/uploads/${info.stock_content}`,
        });
      } else {
        deliveredItems.push({
          productName: item.product_name,
          variationName: item.variation_name,
          type: "infinite",
          content: info.stock_content || "Entrega automática ativada",
        });
      }

      await client.query(`UPDATE order_items SET delivered_at = NOW() WHERE id = $1`, [item.id]);
    }

    // Saldo único da loja: lock consultivo serializa crédito/resgate
    // concorrentes sem travar a tabela inteira.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('wallet'))`);
    const balanceRes = await client.query(`SELECT COALESCE(SUM(amount), 0) AS balance FROM wallet_ledger`);
    const currentBalance = Number(balanceRes.rows[0].balance);
    const credit = Number(order.subtotal) + Number(order.shipping_fee) - Number(order.platform_fee);
    const newBalance = currentBalance + credit;

    await client.query(
      `INSERT INTO wallet_ledger (order_id, type, amount, balance_after, note)
       VALUES ($1, 'sale_credit', $2, $3, $4)`,
      [orderId, credit, newBalance, `Venda do pedido #${orderId}`]
    );

    if (hasPhysical) {
      const quoteRes = await client.query(
        `SELECT carrier_id, price FROM shipping_quotes WHERE order_id = $1 AND selected = true LIMIT 1`,
        [orderId]
      );
      const quote = quoteRes.rows[0];
      await client.query(
        `INSERT INTO shipments (order_id, carrier_id, shipping_cost, status) VALUES ($1, $2, $3, 'preparing')`,
        [orderId, quote?.carrier_id ?? null, quote?.price ?? null]
      );
    }

    // Pedido 100% digital: tudo já foi entregue nesta mesma transação.
    // Pedido com item físico fica em "paid" até a equipe despachar (fase 4/dashboard).
    const finalStatus = hasPhysical ? "paid" : "delivered";
    const finalRes = await client.query(
      `UPDATE orders SET status = $2 WHERE id = $1 RETURNING *`,
      [orderId, finalStatus]
    );

    return { alreadyProcessed: false, order: finalRes.rows[0], customerEmail, deliveredItems, hasPhysical };
  });
}
