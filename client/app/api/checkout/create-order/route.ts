"use server";

import { getDB, withTransaction } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { config } from "@/config/configuration";
import { getDiscountAmount, qualifiesForFreeShipping } from "@/lib/pricing/cartDiscount";
import { loadPromotionSettings } from "@/lib/pricing/promotionSettings";
import { ensureOrderNumberColumn, generateUniqueOrderNumber } from "@/lib/orders/orderNumber";

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

// Só monta o pedido — NÃO cobra ainda. A cobrança de verdade acontece em
// /api/checkout/pay/[orderId], depois que o cliente escolhe o método no
// Payment Brick (Pix/cartão/boleto). Separar os dois passos evita ter que
// decidir o método de pagamento antes de sequer mostrar o resumo pro
// cliente, e casa com como o Brick funciona (ele só sabe o método depois
// que o cliente interage com o formulário).
export async function POST(req: Request) {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const db = getDB();

    const storeStatusRes = await db.query(`SELECT suspended FROM store_settings ORDER BY id DESC LIMIT 1`);
    if (storeStatusRes.rows[0]?.suspended) {
      return fail("STORE_SUSPENDED", 503);
    }

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

    // Lido uma vez só, funciona pra pedido físico (endereço) e digital
    // (só cupom) — antes só era lido dentro do bloco de físico, então
    // cupom nunca chegava a ser considerado num carrinho 100% digital.
    const body = await req.json().catch(() => ({}));

    const hasPhysical = cartRes.rows.some((row) => row.product_type === "physical");
    let shipping: ShippingChoice | null = null;

    if (hasPhysical) {
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
    const promotionSettings = await loadPromotionSettings();

    if (subtotal < promotionSettings.minOrderValue) {
      return fail(`MIN_ORDER_VALUE:${promotionSettings.minOrderValue}`, 400);
    }

    // Cupom é revalidado aqui inteiro, nunca a partir do que o client
    // calculou — mesmo princípio do desconto progressivo. Cupom e degrau
    // automático não se empilham: usa o que for melhor pro cliente, pra
    // não ter desconto somado sem limite nenhum.
    let coupon: { id: number; code: string; percentOff: number } | null = null;
    const couponCode = String(body?.couponCode ?? "").trim().toUpperCase();
    if (couponCode) {
      const couponRes = await db.query(
        `SELECT id, code, percent_off, min_order_value FROM coupons
         WHERE code = $1 AND active = true AND (expires_at IS NULL OR expires_at > NOW())
           AND (usage_limit = 0 OR used_count < usage_limit)`,
        [couponCode]
      );
      const row = couponRes.rows[0];
      if (!row) return fail("INVALID_COUPON", 400);
      if (row.min_order_value && subtotal < Number(row.min_order_value)) {
        return fail(`COUPON_MIN_ORDER_VALUE:${row.min_order_value}`, 400);
      }
      coupon = { id: row.id, code: row.code, percentOff: Number(row.percent_off) };
    }

    const tierDiscount = getDiscountAmount(subtotal, promotionSettings.discountTiers);
    const couponDiscount = coupon ? Math.round(subtotal * (coupon.percentOff / 100) * 100) / 100 : 0;
    const usingCoupon = coupon !== null && couponDiscount > tierDiscount;
    const discount = usingCoupon ? couponDiscount : tierDiscount;
    const appliedCouponId = usingCoupon ? coupon!.id : null;

    const rawShippingFee = shipping ? shipping.price : 0;
    const shippingFee = shipping && qualifiesForFreeShipping(subtotal, promotionSettings) ? 0 : rawShippingFee;
    const total = Math.round((subtotal - discount + shippingFee) * 100) / 100;

    await ensureOrderNumberColumn();

    const { orderId, orderNumber: newOrderNumber } = await withTransaction(async (client) => {
      const orderNumber = await generateUniqueOrderNumber(client);
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
        `INSERT INTO orders (user_id, status, total, subtotal, discount, shipping_fee, shipping_address_id, coupon_id, order_number)
         VALUES ($1, 'pending_payment', $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [userId, total, subtotal, discount, shippingFee, shippingAddressId, appliedCouponId, orderNumber]
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

      if (appliedCouponId) {
        await client.query(`UPDATE coupons SET used_count = used_count + 1 WHERE id = $1`, [appliedCouponId]);
      }

      await client.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);

      return { orderId: newOrderId, orderNumber };
    });

    return ok(
      {
        orderId, orderNumber: newOrderNumber, total,
        appliedCoupon: usingCoupon ? coupon!.code : null,
        mercadoPagoPublicKey: config.payments.mercadoPago.publicKey ?? null,
      },
      201
    );
  } catch (error) {
    console.error("Erro ao criar pedido:", error);
    return fail("CHECKOUT_INTERNAL_ERROR", 500);
  }
}
