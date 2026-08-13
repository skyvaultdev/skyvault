"use server";

import crypto from "crypto";
import { getDB, withTransaction } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { getPaymentProvider } from "@/lib/payments";

type ShippingChoice = {
  recipientName: string;
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  carrierId: number | null;
  carrierName: string;
  serviceName: string;
  price: number;
  etaDays: number;
};

export async function POST(req: Request) {
  try {
    const { email, userId, denied } = await requireCustomer();
    if (denied) return denied;

    const db = getDB();

    const cartRes = await db.query(
      `SELECT
         c.id AS cart_item_id, c.quantity,
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

    if (cartRes.rows.length === 0) return fail("EMPTY_CART", 400);

    for (const row of cartRes.rows) {
      if (!row.is_unlimited && Number(row.stock_count) < row.quantity) {
        return fail(`OUT_OF_STOCK:${row.product_name}`, 409);
      }
    }

    const hasPhysical = cartRes.rows.some((row) => row.product_type === "physical");
    let shipping: ShippingChoice | null = null;

    if (hasPhysical) {
      const body = await req.json().catch(() => ({}));
      const s = body?.shipping ?? {};
      shipping = {
        recipientName: String(s.recipientName ?? "").trim(),
        cep: String(s.cep ?? "").replace(/\D/g, ""),
        street: String(s.street ?? "").trim(),
        number: String(s.number ?? "").trim(),
        complement: String(s.complement ?? "").trim() || undefined,
        neighborhood: String(s.neighborhood ?? "").trim(),
        city: String(s.city ?? "").trim(),
        state: String(s.state ?? "").trim().toUpperCase().slice(0, 2),
        carrierId: s.carrierId != null ? Number(s.carrierId) : null,
        carrierName: String(s.carrierName ?? "").trim(),
        serviceName: String(s.serviceName ?? "").trim(),
        price: Number(s.price),
        etaDays: Number(s.etaDays) || 0,
      };

      const missingAddress =
        !shipping.recipientName || shipping.cep.length !== 8 || !shipping.street ||
        !shipping.number || !shipping.neighborhood || !shipping.city || shipping.state.length !== 2;
      if (missingAddress) return fail("MISSING_SHIPPING_ADDRESS", 400);
      if (!shipping.serviceName || isNaN(shipping.price)) return fail("MISSING_SHIPPING_QUOTE", 400);
    }

    const subtotal = cartRes.rows.reduce((sum, row) => sum + Number(row.unit_price) * row.quantity, 0);

    const settingsRes = await db.query(
      `SELECT platform_fee_percent, platform_fee_fixed FROM store_settings ORDER BY id DESC LIMIT 1`
    );
    const settings = settingsRes.rows[0] ?? { platform_fee_percent: 0, platform_fee_fixed: 0 };
    const platformFee = Math.round((subtotal * (Number(settings.platform_fee_percent) / 100) + Number(settings.platform_fee_fixed)) * 100) / 100;

    const discount = 0;
    const shippingFee = shipping ? shipping.price : 0;
    const total = Math.round((subtotal - discount + shippingFee) * 100) / 100;
    const idempotencyKey = crypto.randomUUID();

    // Resolvido antes da transação: quem vai processar o pagamento decide
    // qual "provider" grava no payment_transactions, e a chamada real pra
    // fora (createCharge) não deve rodar com uma transação de banco aberta.
    const paymentProvider = await getPaymentProvider();

    const { orderId, paymentTransactionId } = await withTransaction(async (client) => {
      let shippingAddressId: number | null = null;

      if (shipping) {
        const addressRes = await client.query(
          `INSERT INTO shipping_addresses
             (user_id, recipient_name, cep, street, number, complement, neighborhood, city, state)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            userId, shipping.recipientName, shipping.cep, shipping.street, shipping.number,
            shipping.complement ?? null, shipping.neighborhood, shipping.city, shipping.state,
          ]
        );
        shippingAddressId = addressRes.rows[0].id;
      }

      const orderRes = await client.query(
        `INSERT INTO orders (user_id, status, total, subtotal, platform_fee, discount, shipping_fee, shipping_address_id)
         VALUES ($1, 'pending_payment', $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [userId, total, subtotal, platformFee, discount, shippingFee, shippingAddressId]
      );
      const newOrderId = orderRes.rows[0].id;

      for (const row of cartRes.rows) {
        await client.query(
          `INSERT INTO order_items
             (order_id, product_id, variation_id, product_name, variation_name, quantity, unit_price, product_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            newOrderId, row.product_id, row.variation_id, row.product_name,
            row.variation_name, row.quantity, row.unit_price, row.product_type,
          ]
        );
      }

      if (shipping) {
        await client.query(
          `INSERT INTO shipping_quotes (order_id, carrier_id, service_name, price, eta_days, selected)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [newOrderId, shipping.carrierId, `${shipping.carrierName} — ${shipping.serviceName}`, shipping.price, shipping.etaDays]
        );
      }

      await client.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);

      const txRes = await client.query(
        `INSERT INTO payment_transactions (order_id, provider, method, status, amount, idempotency_key)
         VALUES ($1, $2, 'pix', 'created', $3, $4)
         RETURNING id`,
        [newOrderId, paymentProvider.name, total, idempotencyKey]
      );

      return { orderId: newOrderId, paymentTransactionId: txRes.rows[0].id };
    });

    const charge = await paymentProvider.createCharge({
      orderId,
      amount: total,
      method: "pix",
      idempotencyKey,
      customerEmail: email!,
    });

    await db.query(
      `UPDATE payment_transactions
       SET provider_txid = $1, status = $2, raw_payload = $3, updated_at = NOW()
       WHERE id = $4`,
      [charge.providerTxid, charge.status, JSON.stringify(charge.raw), paymentTransactionId]
    );

    return ok(
      { orderId, total, status: charge.status, pixCopyPaste: charge.pixCopyPaste, provider: paymentProvider.name },
      201
    );
  } catch (error) {
    console.error("Erro ao criar pedido:", error);
    return fail("CHECKOUT_INTERNAL_ERROR", 500);
  }
}
