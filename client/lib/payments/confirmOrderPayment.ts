import fs from "fs";
import path from "path";
import { withTransaction } from "@/lib/database/db";
import type { DeliveredDigitalItem } from "@/lib/mail/sendOrderDeliveryEmail";
import { ensureStockMovementsTable, logStockMovement } from "@/lib/stock/stockMovements";
import { ensureOrderItemDeliverySnapshotColumns, ensureOrderAttentionColumn } from "@/lib/orders/deliverySnapshot";
import { ensureResellerTables } from "@/lib/resellers/ensureResellerTables";
import { creditResellerCommissions } from "@/lib/resellers/creditCommissions";
import { ensureNotificationsTable } from "@/lib/notifications/ensureNotificationsTable";
import { createNotification } from "@/lib/notifications/createNotification";

export type StockShortage = {
  productName: string;
  variationName: string | null;
  requested: number;
  delivered: number;
  shortage: number;
  // true = o cliente pagou por N unidades e recebeu menos que isso de
  // verdade (físico, ou chave sem estoque suficiente) — nesse caso o
  // pedido NÃO pode virar "delivered" sozinho. false = arquivo/infinito,
  // que continuam sendo entregues por completo mesmo com stock_count
  // zerado (a contagem é só informativa nesses tipos, não um limite real
  // de fulfillment).
  blocksDelivery: boolean;
};

export type ConfirmOrderPaymentResult = {
  alreadyProcessed: boolean;
  order: any;
  customerEmail: string | null;
  deliveredItems: DeliveredDigitalItem[];
  hasPhysical: boolean;
  stockShortages: StockShortage[];
};

// Núcleo atômico da confirmação de pagamento — chamado tanto pelo endpoint
// de teste (mock-confirm-payment) quanto pelo webhook real do Mercado Pago
// e por /api/checkout/pay (cartão, que confirma na hora). Idempotente: se
// o pedido já está pago, não repete o débito de estoque (o Mercado Pago
// pode reenviar o mesmo webhook mais de uma vez).
export async function confirmOrderPayment(orderId: number): Promise<ConfirmOrderPaymentResult> {
  await ensureStockMovementsTable();
  await ensureOrderItemDeliverySnapshotColumns();
  await ensureOrderAttentionColumn();
  await ensureResellerTables();
  await ensureNotificationsTable();
  return withTransaction(async (client) => {
    const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (orderRes.rows.length === 0) {
      throw new Error("ORDER_NOT_FOUND");
    }
    const order = orderRes.rows[0];

    const emailRes = await client.query(`SELECT email FROM users WHERE id = $1`, [order.user_id]);
    const customerEmail = emailRes.rows[0]?.email ?? null;

    if (order.status === "paid" || order.status === "delivered") {
      return { alreadyProcessed: true, order, customerEmail, deliveredItems: [], hasPhysical: false, stockShortages: [] };
    }

    await client.query(
      `UPDATE payment_transactions SET status = 'paid', updated_at = NOW() WHERE order_id = $1 AND status != 'paid'`,
      [orderId]
    );

    await client.query(`UPDATE orders SET status = 'paid', paid_at = NOW() WHERE id = $1`, [orderId]);

    const itemsRes = await client.query(`SELECT * FROM order_items WHERE order_id = $1`, [orderId]);

    const deliveredItems: DeliveredDigitalItem[] = [];
    const stockShortages: StockShortage[] = [];
    let hasPhysical = false;

    for (const item of itemsRes.rows) {
      const isVariation = item.variation_id != null;
      const table = isVariation ? "product_variations" : "products";
      const targetId = isVariation ? item.variation_id : item.product_id;
      if (!targetId) continue; // produto/variação removido depois da compra

      // FOR UPDATE trava a linha até essa transação terminar — se duas
      // confirmações concorrentes disputarem o mesmo produto, a segunda
      // fica bloqueada aqui até a primeira commitar, e enxerga o
      // stock_count JÁ atualizado. É isso que evita overselling por race
      // condition, não a lógica abaixo.
      const infoRes = await client.query(
        `SELECT stock_type, stock_content, stock_count, is_unlimited FROM ${table} WHERE id = $1 FOR UPDATE`,
        [targetId]
      );
      if (infoRes.rows.length === 0) continue;
      const info = infoRes.rows[0];

      if (item.product_type === "physical") {
        hasPhysical = true;
        if (!info.is_unlimited) {
          const available = Number(info.stock_count ?? 0);
          const actualDecrement = Math.min(item.quantity, available);
          const shortage = item.quantity - actualDecrement;

          await client.query(
            `UPDATE ${table} SET stock_count = GREATEST(stock_count - $1, 0) WHERE id = $2`,
            [item.quantity, targetId]
          );
          await logStockMovement(client, {
            productId: item.product_id, variationId: item.variation_id,
            productName: item.product_name, variationName: item.variation_name,
            change: -actualDecrement, reason: "sale", orderId,
            note: shortage > 0 ? `Estoque insuficiente: pedidas ${item.quantity}, disponíveis ${available} — faltaram ${shortage}` : null,
          });

          if (shortage > 0) {
            console.error(
              `[confirmOrderPayment] pedido #${orderId}: estoque insuficiente para "${item.product_name}"` +
              `${item.variation_name ? ` (${item.variation_name})` : ""} — pedidas ${item.quantity}, disponíveis ${available}, faltaram ${shortage}.`
            );
            stockShortages.push({
              productName: item.product_name, variationName: item.variation_name,
              requested: item.quantity, delivered: actualDecrement, shortage, blocksDelivery: true,
            });
          }
        }
        continue;
      }

      // Digital: key/file/infinite. stock_count só é decrementado pra
      // file/infinite aqui — key tem sua própria contagem (linhas em
      // stock_keys) e é decrementada junto da reserva, abaixo.
      if (!info.is_unlimited && info.stock_type !== "key") {
        const available = Number(info.stock_count ?? 0);
        const actualDecrement = Math.min(item.quantity, available);
        const shortage = item.quantity - actualDecrement;

        await client.query(
          `UPDATE ${table} SET stock_count = GREATEST(stock_count - $1, 0) WHERE id = $2`,
          [item.quantity, targetId]
        );
        await logStockMovement(client, {
          productId: item.product_id, variationId: item.variation_id,
          productName: item.product_name, variationName: item.variation_name,
          change: -actualDecrement, reason: "sale", orderId,
          note: shortage > 0 ? `Estoque insuficiente: pedidas ${item.quantity}, disponíveis ${available} — faltaram ${shortage}` : null,
        });

        // Diferente de físico/key, arquivo/infinito ainda são entregues
        // mesmo com stock_count zerado (não são um limite real de
        // fulfillment) — só registra a divergência pra o staff revisar o
        // cadastro, não bloqueia a entrega.
        if (shortage > 0) {
          console.warn(
            `[confirmOrderPayment] pedido #${orderId}: stock_count insuficiente para "${item.product_name}"` +
            `${item.variation_name ? ` (${item.variation_name})` : ""} (tipo ${info.stock_type}) — pedidas ${item.quantity}, disponíveis ${available}. Entregue normalmente.`
          );
        }
      }

      let itemDeliveredSuccessfully = true;
      // Snapshot do que foi entregue NESTE pedido — key não precisa (já é
      // amarrada por stock_keys.order_id, permanente); arquivo/infinito
      // gravam aqui porque o produto pode ser editado/trocado depois, e sem
      // isso o pedido passaria a mostrar o conteúdo NOVO do produto, não o
      // que o cliente realmente recebeu (ver migração 2026-09-22).
      let deliveredContentSnapshot: string | null = null;
      let deliveredFileSize: number | null = null;

      if (info.stock_type === "key") {
        const keyColumn = isVariation ? "variation_id" : "product_id";
        let keysDelivered = 0;
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
            keysDelivered++;
            deliveredItems.push({
              productName: item.product_name,
              variationName: item.variation_name,
              type: "key",
              content: keyRes.rows[0].key_content,
            });
          }
        }

        const keyShortage = item.quantity - keysDelivered;
        if (keyShortage > 0) {
          console.error(
            `[confirmOrderPayment] pedido #${orderId}: estoque de chaves insuficiente para "${item.product_name}"` +
            `${item.variation_name ? ` (${item.variation_name})` : ""} — pedidas ${item.quantity}, entregues ${keysDelivered}, faltaram ${keyShortage}.`
          );
          stockShortages.push({
            productName: item.product_name, variationName: item.variation_name,
            requested: item.quantity, delivered: keysDelivered, shortage: keyShortage, blocksDelivery: true,
          });
          // Nenhuma chave saiu pra esse item — não marca como entregue
          // (order_items.delivered_at abaixo), senão a tela do cliente e o
          // e-mail mostrariam "recebido" pra algo que não recebeu nada.
          if (keysDelivered === 0) itemDeliveredSuccessfully = false;
        }

        // Decrementa pela quantidade REALMENTE entregue, não pela pedida —
        // decrementar pela pedida quando faltou chave subtrairia estoque
        // que nunca existiu, distorcendo a contagem pra sempre.
        if (!info.is_unlimited && keysDelivered > 0) {
          await client.query(
            `UPDATE ${table} SET stock_count = GREATEST(stock_count - $1, 0) WHERE id = $2`,
            [keysDelivered, targetId]
          );
          await logStockMovement(client, {
            productId: item.product_id, variationId: item.variation_id,
            productName: item.product_name, variationName: item.variation_name,
            change: -keysDelivered, reason: "sale", orderId,
            note: keyShortage > 0 ? `Estoque de chaves insuficiente: pedidas ${item.quantity}, entregues ${keysDelivered} — faltaram ${keyShortage}` : null,
          });
        }
      } else if (info.stock_type === "file") {
        // Grava o caminho completo (com prefixo), não só o nome do
        // arquivo — é assim que o snapshot se distingue de uma mensagem
        // "infinite" ao ser relido depois (mesma convenção do
        // FILE_DOWNLOAD_PREFIX em sendOrderDeliveryEmail.ts).
        deliveredContentSnapshot = `/api/files/products/uploads/${info.stock_content}`;
        try {
          const filePath = path.join(process.cwd(), "stock", "products", "uploads", info.stock_content);
          deliveredFileSize = fs.statSync(filePath).size;
        } catch {
          // Arquivo sumiu do disco de algum jeito — entrega ainda registra
          // o nome (pro staff investigar), só sem o tamanho.
          deliveredFileSize = null;
        }
        deliveredItems.push({
          productName: item.product_name,
          variationName: item.variation_name,
          type: "file",
          content: deliveredContentSnapshot,
          fileSize: deliveredFileSize,
        });
      } else {
        const infiniteMessage: string = info.stock_content || "Entrega automática ativada";
        deliveredContentSnapshot = infiniteMessage;
        deliveredItems.push({
          productName: item.product_name,
          variationName: item.variation_name,
          type: "infinite",
          content: infiniteMessage,
        });
      }

      if (itemDeliveredSuccessfully) {
        await client.query(
          `UPDATE order_items SET delivered_at = NOW(), delivered_content = COALESCE($2, delivered_content), delivered_file_size = $3 WHERE id = $1`,
          [item.id, deliveredContentSnapshot, deliveredFileSize]
        );
      }
    }

    // Comissão de revendedor só é gravada aqui — no momento em que o
    // pagamento REALMENTE confirma (nunca antes, nunca por fora dessa
    // transação) — pra nunca existir comissão de um pedido que não chegou
    // a pagar. Só credita se o pedido veio de um link de revendedor.
    if (order.reseller_id) {
      await creditResellerCommissions(client, orderId, order.reseller_id, itemsRes.rows);
    }

    // Sem passo de saldo interno: o pagamento já cai direto na conta
    // Mercado Pago do dono da loja (credencial dele) — não tem dinheiro
    // pra "creditar" por dentro do nosso sistema.
    if (hasPhysical) {
      const quoteRes = await client.query(
        `SELECT carrier_id, price FROM shipping_quotes WHERE order_id = $1 AND selected = true LIMIT 1`,
        [orderId]
      );
      const quote = quoteRes.rows[0];
      const shipmentRes = await client.query(
        `INSERT INTO shipments (order_id, carrier_id, shipping_cost, status) VALUES ($1, $2, $3, 'preparing') RETURNING id`,
        [orderId, quote?.carrier_id ?? null, quote?.price ?? null]
      );
      await client.query(
        `INSERT INTO shipment_events (shipment_id, status, description) VALUES ($1, 'preparing', 'Pedido pago — preparando envio')`,
        [shipmentRes.rows[0].id]
      );
    }

    // Pedido 100% digital: tudo já foi entregue nesta mesma transação —
    // MAS só marca como "delivered" se realmente entregou tudo. Um pedido
    // de chave sem estoque suficiente não pode virar "entregue" com o
    // cliente de mãos vazias; fica "paid" (como um físico não despachado)
    // até o staff resolver manualmente e reconciliar.
    const hasBlockingShortage = stockShortages.some((s) => s.blocksDelivery);
    const finalStatus = hasPhysical || hasBlockingShortage ? "paid" : "delivered";
    const finalRes = await client.query(
      `UPDATE orders SET status = $2 WHERE id = $1 RETURNING *`,
      [orderId, finalStatus]
    );
    const finalOrder = finalRes.rows[0];

    if (stockShortages.length > 0) {
      const note = stockShortages
        .map((s) => `${s.productName}${s.variationName ? ` (${s.variationName})` : ""}: pedidos ${s.requested}, atendidos ${s.delivered}, faltaram ${s.shortage}`)
        .join(" | ");
      await client.query(`UPDATE orders SET attention_note = $2 WHERE id = $1`, [orderId, `Estoque insuficiente — ${note}`]);
      finalOrder.attention_note = note;
    }

    // Notificação in-app de "pagamento confirmado" — complementa o email
    // de entrega (que os 4 call sites já enviam), nunca substitui. Mesma
    // tabela usada por convites de revendedor e avisos da loja. O corpo
    // lista os produtos pelo NOME — só o número do pedido não diz pro
    // cliente o que ele comprou; o ID continua no título, pra quem quiser
    // mencionar o pedido específico.
    const productNames = itemsRes.rows.map((item) => item.product_name).join(", ");
    await createNotification(client, {
      userId: finalOrder.user_id,
      type: "order_update",
      title: `Pagamento confirmado — pedido ${finalOrder.order_number || `#${orderId}`}`,
      body: `${productNames} — ${finalStatus === "delivered" ? "entregue." : "já estamos preparando tudo."}`,
      data: { orderId },
    });

    return { alreadyProcessed: false, order: finalOrder, customerEmail, deliveredItems, hasPhysical, stockShortages };
  });
}
