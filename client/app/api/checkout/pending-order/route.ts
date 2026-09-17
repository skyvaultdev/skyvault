"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { config } from "@/config/configuration";

// Pedido criado (create-order) mas nunca pago — se o cliente sair da tela
// de pagamento e voltar pro checkout, ele precisa ver isso em vez de só
// abrir um carrinho vazio (o carrinho já foi consumido na hora de criar o
// pedido) e ficar sem opção além de tentar comprar tudo de novo, gerando
// vários pedidos pendentes soltos.
export async function GET() {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const db = getDB();
    const orderRes = await db.query(
      `SELECT id, order_number, total, subtotal, discount, shipping_fee, created_at
       FROM orders
       WHERE user_id = $1 AND status = 'pending_payment'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    const order = orderRes.rows[0];
    if (!order) return ok(null);

    const itemsRes = await db.query(
      `SELECT product_name, variation_name, quantity, unit_price, product_type
       FROM order_items WHERE order_id = $1 ORDER BY id ASC`,
      [order.id]
    );

    const cartCountRes = await db.query(`SELECT COUNT(*) AS count FROM cart_items WHERE user_id = $1`, [userId]);

    // Se já existe uma cobrança Pix/boleto pendente pra esse pedido,
    // devolve os dados pra mostrar o MESMO QR/código de novo — sem isso,
    // "Continuar pagamento" reabria a escolha de método do zero e podia
    // gerar uma cobrança nova (2ª transação), enquanto a checagem de
    // pagamento olhava só pra mais recente e nunca via que a primeira,
    // essa sim paga pelo cliente, tinha realmente caído.
    const txRes = await db.query(
      `SELECT method, raw_payload FROM payment_transactions
       WHERE order_id = $1 AND provider = 'mercadopago' AND status = 'pending' AND method IN ('pix', 'boleto')
       ORDER BY created_at DESC LIMIT 1`,
      [order.id]
    );
    const tx = txRes.rows[0];
    let pendingPayment = null;
    if (tx) {
      let raw: any = {};
      try {
        raw = typeof tx.raw_payload === "string" ? JSON.parse(tx.raw_payload) : (tx.raw_payload ?? {});
      } catch {
        raw = {};
      }
      pendingPayment = {
        method: tx.method,
        pixCopyPaste: raw?.point_of_interaction?.transaction_data?.qr_code ?? null,
        pixQrCodeBase64: raw?.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
        boletoUrl: raw?.transaction_details?.external_resource_url ?? null,
        boletoBarcode: raw?.barcode?.content ?? null,
      };
    }

    return ok({
      orderId: order.id,
      orderNumber: order.order_number ?? null,
      total: Number(order.total),
      subtotal: Number(order.subtotal),
      discount: Number(order.discount ?? 0),
      shippingFee: Number(order.shipping_fee ?? 0),
      createdAt: order.created_at,
      items: itemsRes.rows,
      hasNewCartItems: Number(cartCountRes.rows[0]?.count ?? 0) > 0,
      mercadoPagoPublicKey: config.payments.mercadoPago.publicKey ?? null,
      pendingPayment,
    });
  } catch (error) {
    console.error("Erro ao buscar pedido pendente:", error);
    return fail("PENDING_ORDER_FETCH_ERROR", 500);
  }
}
