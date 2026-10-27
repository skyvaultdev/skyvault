import { getDB, withTransaction } from "@/lib/database/db";
import { cancelMercadoPagoPayment } from "@/lib/payments/mercadoPagoProvider";
import { config } from "@/config/configuration";

export type ExpirePendingOrdersResult = {
  expiredOrderIds: number[];
  cancelFailures: Array<{ orderId: number; providerTxid: string; error: string }>;
};

// Pedido pending_payment velho demais nunca vai ser pago (cliente desistiu,
// Pix expirou do lado do Mercado Pago, etc.) — fica preso nesse status pra
// sempre se nada o marcar como encerrado. Chamado pela rota protegida
// POST /api/internal/cron/expire-orders (ver README, seção de cron) numa
// loja já selecionada via runWithStore — essa função não resolve a loja
// sozinha.
export async function expirePendingOrders(hours: number = config.orders.expirationHours): Promise<ExpirePendingOrdersResult> {
  const db = getDB();
  const expiredOrderIds: number[] = [];
  const cancelFailures: ExpirePendingOrdersResult["cancelFailures"] = [];

  const staleRes = await db.query(
    `SELECT id FROM orders WHERE status = 'pending_payment' AND created_at < NOW() - ($1 || ' hours')::interval`,
    [hours]
  );

  for (const row of staleRes.rows) {
    const orderId = Number(row.id);

    // Se existe Pix/boleto pendente no Mercado Pago, tenta cancelar lá
    // também — senão o pagamento continua "em aberto" do lado do provider
    // mesmo com o pedido já encerrado aqui. Falha nisso só loga, nunca
    // impede o pedido de expirar (o Mercado Pago também expira Pix sozinho
    // depois de um tempo).
    const pendingTxRes = await db.query(
      `SELECT provider_txid FROM payment_transactions
       WHERE order_id = $1 AND provider = 'mercadopago' AND status = 'pending' AND provider_txid IS NOT NULL`,
      [orderId]
    );
    for (const tx of pendingTxRes.rows) {
      try {
        await cancelMercadoPagoPayment(tx.provider_txid);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[expirePendingOrders] pedido #${orderId}: falha ao cancelar pagamento ${tx.provider_txid} no Mercado Pago —`, message);
        cancelFailures.push({ orderId, providerTxid: tx.provider_txid, error: message });
      }
    }

    // Condição no WHERE (não só no SELECT inicial) garante que um pedido
    // pago entre a leitura e aqui (webhook concorrente, por exemplo) nunca
    // é sobrescrito de volta pra "expired".
    const expired = await withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE orders SET status = 'expired' WHERE id = $1 AND status = 'pending_payment' RETURNING id`,
        [orderId]
      );
      if (res.rows.length === 0) return false;
      await client.query(
        `UPDATE payment_transactions SET status = 'expired', updated_at = NOW() WHERE order_id = $1 AND status = 'pending'`,
        [orderId]
      );
      return true;
    });
    if (expired) expiredOrderIds.push(orderId);
  }

  return { expiredOrderIds, cancelFailures };
}
