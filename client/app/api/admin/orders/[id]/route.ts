"use server";

import crypto from "crypto";
import type { PoolClient } from "pg";
import { getDB, withTransaction } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { getMailTransporter } from "@/lib/mail/transporter";
import { loadStoreBranding, buildBrandedEmailHtml, emailParagraph, emailItemsList, trackingCodeBox } from "@/lib/mail/emailTemplate";
import { logStockMovement } from "@/lib/stock/stockMovements";

type Params = { params: Promise<{ id: string }> };

const SHIPMENT_STATUSES = ["preparing", "posted", "in_transit", "delivered", "returned", "cancelled"];

export async function GET(_req: Request, { params }: Params) {
  try {
    const { denied } = await requirePermission("orders.read");
    if (denied) return denied;

    const { id } = await params;
    const orderId = Number(id);
    if (!orderId) return fail("INVALID_ORDER_ID", 400);

    const db = getDB();
    const orderRes = await db.query(
      `SELECT o.*, u.email AS customer_email
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = $1`,
      [orderId]
    );
    if (orderRes.rows.length === 0) return fail("ORDER_NOT_FOUND", 404);
    const order = orderRes.rows[0];

    // Itens enriquecidos: imagem, categoria e peso — pra dar pro staff uma
    // visão real do que foi vendido, não só nome/quantidade/preço.
    const [itemsRes, addressRes, txRes, shipmentRes] = await Promise.all([
      db.query(
        `SELECT
           oi.*,
           p.slug AS product_slug,
           cat.name AS category_name,
           (SELECT url FROM product_images pi WHERE pi.product_id = oi.product_id ORDER BY position ASC LIMIT 1) AS image_url,
           COALESCE(v.weight_grams, p.weight_grams) AS weight_grams,
           COALESCE(v.length_cm, p.length_cm) AS length_cm,
           COALESCE(v.width_cm, p.width_cm) AS width_cm,
           COALESCE(v.height_cm, p.height_cm) AS height_cm
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN categories cat ON cat.id = p.category_id
         LEFT JOIN product_variations v ON v.id = oi.variation_id
         WHERE oi.order_id = $1
         ORDER BY oi.id ASC`,
        [orderId]
      ),
      order.shipping_address_id
        ? db.query(`SELECT * FROM shipping_addresses WHERE id = $1`, [order.shipping_address_id])
        : Promise.resolve({ rows: [] }),
      db.query(`SELECT * FROM payment_transactions WHERE order_id = $1 ORDER BY created_at DESC`, [orderId]),
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
      items: itemsRes.rows,
      shippingAddress: addressRes.rows[0] ?? null,
      paymentTransactions: txRes.rows,
      shipment,
      shipmentEvents: eventsRes.rows,
    });
  } catch (error) {
    console.error("Erro ao buscar pedido:", error);
    return fail("ORDER_FETCH_ERROR", 500);
  }
}

// Sem integração real de postagem (não compramos etiqueta pela API do
// Melhor Envio, só cotamos) — não existe um código de rastreio de verdade
// pra puxar automaticamente. Isso aqui gera um código no MESMO formato dos
// Correios (2 letras + 9 dígitos + BR) só pra a experiência do
// cliente/staff não ficar sem nada assim que o staff marca "Postado" — não
// é rastreável numa transportadora de verdade.
function generateTrackingCode(orderId: number): string {
  const digits = String(orderId).padStart(6, "0").slice(-6) + crypto.randomInt(100, 999);
  return `SV${digits}BR`;
}

async function restockPhysicalItems(db: PoolClient, orderId: number, staffEmail: string | null) {
  const items = await db.query(
    `SELECT product_id, variation_id, product_name, variation_name, quantity
     FROM order_items WHERE order_id = $1 AND product_type = 'physical'`,
    [orderId]
  );
  for (const item of items.rows) {
    const targetId = item.variation_id ?? item.product_id;
    if (!targetId) continue;
    const table = item.variation_id ? "product_variations" : "products";
    const updateRes = await db.query(
      `UPDATE ${table} SET stock_count = stock_count + $1 WHERE id = $2 AND is_unlimited = false RETURNING id`,
      [item.quantity, targetId]
    );
    if (updateRes.rows.length === 0) continue; // is_unlimited=true: nada a estornar
    await logStockMovement(db, {
      productId: item.product_id, variationId: item.variation_id,
      productName: item.product_name, variationName: item.variation_name,
      change: item.quantity, reason: "cancel_restock", orderId, staffEmail,
    });
  }
}

function money(value: number | string) {
  return `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

type NotificationEvent =
  | "paid" | "delivered" | "refunded" | "order_cancelled"
  | "shipment_posted" | "shipment_in_transit" | "shipment_delivered"
  | "shipment_returned" | "shipment_cancelled";

type OrderEmailContext = {
  id: number;
  order_number: string | null;
  total: number | string;
  customer_email: string | null;
  tracking_code: string | null;
  items: Array<{ name: string; quantity: number }>;
  reason?: string | null;
};

// Um único vocabulário de evento pra email — evita a ambiguidade de antes,
// onde o conteúdo do email era escolhido a partir de orders.status
// (pending_payment/paid/delivered/cancelled/refunded) mas o texto também
// tentava cobrir "preparing"/"shipped", que NUNCA são valores reais de
// orders.status (são de shipments.status) — esses emails nunca disparavam.
// Cada caso agora também mostra os itens do pedido (não só o número) e, se
// o staff informou um motivo, ele aparece no corpo do email.
function getStatusEmailContent(
  event: NotificationEvent,
  order: OrderEmailContext,
  primaryColor: string,
  secondaryColor: string
): { subject: string; headerSubtitle: string; title: string; bodyHtml: string } | null {
  const items = emailItemsList(order.items);
  const reasonBlock = order.reason
    ? emailParagraph(`Motivo informado pela loja: <strong style="color:#fff;">${order.reason}</strong>`, true)
    : "";
  const orderRef = order.order_number || `#${order.id}`;

  switch (event) {
    case "paid":
      return {
        subject: `Pagamento confirmado — pedido ${orderRef}`,
        headerSubtitle: "Confirmação de pagamento",
        title: "Recebemos seu pagamento",
        bodyHtml:
          emailParagraph(`O pagamento do seu pedido <strong style="color:#fff;">${orderRef}</strong> foi confirmado.`) +
          items +
          emailParagraph(`Total: <strong style="color:#fff;">${money(order.total)}</strong>. Já estamos preparando tudo.`, true),
      };
    case "shipment_posted":
      return {
        subject: `Pedido ${orderRef} enviado`,
        headerSubtitle: "Atualização do envio",
        title: "Seu pedido saiu para envio",
        bodyHtml:
          emailParagraph(`Seu pedido <strong style="color:#fff;">${orderRef}</strong> já está a caminho.`) +
          items +
          (order.tracking_code ? trackingCodeBox(order.tracking_code, primaryColor, secondaryColor) : "") +
          emailParagraph(`Acompanhe o rastreio na área "Meus pedidos".`, true),
      };
    case "shipment_in_transit":
      return {
        subject: `Pedido ${orderRef} em trânsito`,
        headerSubtitle: "Atualização do envio",
        title: "Seu pedido está a caminho",
        bodyHtml:
          emailParagraph(`Seu pedido <strong style="color:#fff;">${orderRef}</strong> está em trânsito.`) +
          items +
          (order.tracking_code ? trackingCodeBox(order.tracking_code, primaryColor, secondaryColor) : ""),
      };
    case "shipment_delivered":
    case "delivered":
      return {
        subject: `Pedido ${orderRef} entregue`,
        headerSubtitle: "Atualização do pedido",
        title: "Pedido entregue",
        bodyHtml:
          emailParagraph(`Seu pedido <strong style="color:#fff;">${orderRef}</strong> foi entregue. Esperamos que aproveite!`) +
          items,
      };
    case "shipment_returned":
      return {
        subject: `Pedido ${orderRef} devolvido ao remetente`,
        headerSubtitle: "Atualização do envio",
        title: "Pedido devolvido",
        bodyHtml:
          emailParagraph(`Seu pedido <strong style="color:#fff;">${orderRef}</strong> foi devolvido ao remetente pela transportadora.`) +
          items +
          reasonBlock +
          emailParagraph("Entramos em contato em breve para resolver — se preferir, abra um ticket de suporte no pedido.", true),
      };
    case "shipment_cancelled":
    case "order_cancelled":
      return {
        subject: `Pedido ${orderRef} cancelado`,
        headerSubtitle: "Atualização do pedido",
        title: "Pedido cancelado",
        bodyHtml:
          emailParagraph(`Seu pedido <strong style="color:#fff;">${orderRef}</strong> foi cancelado.`) +
          items +
          reasonBlock +
          emailParagraph("Se você não esperava por isso, responda este email ou abra um ticket de suporte no pedido.", true),
      };
    case "refunded":
      return {
        subject: `Reembolso confirmado — pedido ${orderRef}`,
        headerSubtitle: "Atualização do pedido",
        title: "Reembolso confirmado",
        bodyHtml:
          emailParagraph(`O reembolso do pedido <strong style="color:#fff;">${orderRef}</strong> (${money(order.total)}) foi confirmado.`) +
          items +
          reasonBlock,
      };
    default:
      return null;
  }
}

async function sendOrderStatusEmail(order: OrderEmailContext, event: NotificationEvent): Promise<boolean> {
  if (!order.customer_email) return false;

  const branding = await loadStoreBranding();
  if (!branding) {
    console.error("Não foi possível enviar email de status: store_settings não encontrado.");
    return false;
  }

  const content = getStatusEmailContent(event, order, branding.primaryColor, branding.secondaryColor);
  if (!content) return false;

  const html = buildBrandedEmailHtml({
    branding,
    headerSubtitle: content.headerSubtitle,
    title: content.title,
    bodyHtml: content.bodyHtml,
  });

  try {
    await getMailTransporter().sendMail({
      from: process.env.EMAIL_USER,
      to: order.customer_email,
      subject: content.subject,
      attachments: branding.logoAttachment ? [branding.logoAttachment] : [],
      html,
    });
    return true;
  } catch (error) {
    console.error(`Erro ao enviar email de status (${event}) para pedido ${order.order_number || `#${order.id}`}:`, error);
    return false;
  }
}

async function fetchOrderEmailItems(db: ReturnType<typeof getDB>, orderId: number) {
  const res = await db.query(
    `SELECT product_name, variation_name, quantity FROM order_items WHERE order_id = $1 ORDER BY id ASC`,
    [orderId]
  );
  return res.rows.map((row) => ({
    name: row.variation_name ? `${row.product_name} — ${row.variation_name}` : row.product_name,
    quantity: row.quantity,
  }));
}

const SHIPMENT_NOTIFICATION_EVENT: Record<string, NotificationEvent | null> = {
  preparing: null, // já é o estado inicial ao pagar — não é uma "mudança" pro cliente
  posted: "shipment_posted",
  in_transit: "shipment_in_transit",
  delivered: "shipment_delivered",
  returned: "shipment_returned",
  cancelled: "shipment_cancelled",
};

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { session, denied } = await requirePermission("orders.manage");
    if (denied) return denied;
    const staffEmail = session?.email ?? null;

    const { id } = await params;
    const orderId = Number(id);
    if (!orderId) return fail("INVALID_ORDER_ID", 400);

    const body = await req.json();
    const db = getDB();
    const notifyEmail = body.notifyEmail !== false;
    const reason = body.reason ? String(body.reason).trim().slice(0, 500) || null : null;

    // Ação 1: atualizar o envio (transportadora/rastreio/etapa) de um
    // pedido físico. Único ponto que grava shipment_events e sincroniza
    // orders.status — antes disso o front mandava o status a cada save
    // (mudando ou não), o que criava uma entrada nova na timeline toda vez.
    if (body.action === "update_shipment") {
      const newStatus = String(body.shipmentStatus ?? "");
      if (!SHIPMENT_STATUSES.includes(newStatus)) return fail("INVALID_SHIPMENT_STATUS", 400);

      const orderRes = await db.query(
        `SELECT o.status, o.total, o.order_number, u.email AS customer_email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
        [orderId]
      );
      if (orderRes.rows.length === 0) return fail("ORDER_NOT_FOUND", 404);
      const orderRow = orderRes.rows[0];
      if (orderRow.status === "cancelled") return fail("ORDER_CANCELLED", 409);

      const eventCity = body.eventCity ? String(body.eventCity).trim() || null : null;
      const eventState = body.eventState ? String(body.eventState).trim().toUpperCase().slice(0, 2) || null : null;
      const eventDescription = body.eventDescription ? String(body.eventDescription).trim() || null : null;
      let trackingCode = body.trackingCode ? String(body.trackingCode).trim() || null : null;

      const result = await withTransaction(async (client) => {
        const shipRes = await client.query(`SELECT * FROM shipments WHERE order_id = $1 FOR UPDATE`, [orderId]);
        let shipment = shipRes.rows[0];
        if (!shipment) {
          const inserted = await client.query(
            `INSERT INTO shipments (order_id, status) VALUES ($1, 'preparing') RETURNING *`,
            [orderId]
          );
          shipment = inserted.rows[0];
        }

        // Fornece o código de rastreio sozinho ao postar, se ninguém digitou um.
        if (newStatus === "posted" && !trackingCode && !shipment.tracking_code) {
          trackingCode = generateTrackingCode(orderId);
        }

        const statusChanged = newStatus !== shipment.status;
        const trackingChanged = trackingCode !== null && trackingCode !== shipment.tracking_code;
        const hasLocationNote = !!(eventCity || eventState || eventDescription);

        // Nada mudou de verdade — não grava evento duplicado nem reenvia email.
        if (!statusChanged && !trackingChanged && !hasLocationNote) {
          return { updated: false as const };
        }

        await client.query(
          `UPDATE shipments
           SET status = $1,
               tracking_code = COALESCE($2, tracking_code),
               shipped_at = CASE WHEN $1 = 'posted' AND shipped_at IS NULL THEN NOW() ELSE shipped_at END,
               delivered_at = CASE WHEN $1 = 'delivered' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END
           WHERE id = $3`,
          [newStatus, trackingCode, shipment.id]
        );

        if (statusChanged || hasLocationNote) {
          await client.query(
            `INSERT INTO shipment_events (shipment_id, status, city, state, description) VALUES ($1, $2, $3, $4, $5)`,
            [shipment.id, newStatus, eventCity, eventState, eventDescription]
          );
        }

        let orderStatusSynced: string | null = null;
        if (statusChanged && newStatus === "delivered") {
          await client.query(`UPDATE orders SET status = 'delivered' WHERE id = $1`, [orderId]);
          orderStatusSynced = "delivered";
        } else if (statusChanged && (newStatus === "cancelled" || newStatus === "returned")) {
          await restockPhysicalItems(client, orderId, staffEmail);
          await client.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [orderId]);
          orderStatusSynced = "cancelled";
        }

        return {
          updated: true as const,
          statusChanged,
          orderStatusSynced,
          finalTrackingCode: trackingCode ?? shipment.tracking_code,
        };
      });

      if (!result.updated) return ok({ updated: false, reason: "NO_CHANGES" });

      let emailSent = false;
      if (notifyEmail && result.statusChanged) {
        const event = SHIPMENT_NOTIFICATION_EVENT[newStatus];
        if (event) {
          const items = await fetchOrderEmailItems(db, orderId);
          emailSent = await sendOrderStatusEmail(
            {
              id: orderId, order_number: orderRow.order_number, total: orderRow.total, customer_email: orderRow.customer_email,
              tracking_code: result.finalTrackingCode, items, reason: eventDescription ?? reason,
            },
            event
          );
        }
      }

      return ok({ updated: true, orderStatusSynced: result.orderStatusSynced, trackingCode: result.finalTrackingCode, emailSent });
    }

    // Ação 2: cancelar o pedido inteiro (digital ou físico). Restoca item
    // físico automaticamente — nunca existia isso antes, cancelar só
    // mudava o texto do status e o estoque debitado no pagamento ficava
    // perdido pra sempre.
    if (body.action === "cancel_order") {
      const orderRes = await db.query(
        `SELECT o.status, o.total, o.order_number, u.email AS customer_email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
        [orderId]
      );
      if (orderRes.rows.length === 0) return fail("ORDER_NOT_FOUND", 404);
      const current = orderRes.rows[0];
      if (current.status === "cancelled") return ok({ updated: false, reason: "ALREADY_CANCELLED" });

      await withTransaction(async (client) => {
        // pending_payment nunca debitou estoque nem foi cobrado — só fecha.
        if (current.status !== "pending_payment") {
          await restockPhysicalItems(client, orderId, staffEmail);
        }
        await client.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [orderId]);

        const shipRes = await client.query(`SELECT id, status FROM shipments WHERE order_id = $1`, [orderId]);
        if (shipRes.rows[0] && shipRes.rows[0].status !== "cancelled") {
          await client.query(`UPDATE shipments SET status = 'cancelled' WHERE id = $1`, [shipRes.rows[0].id]);
          await client.query(
            `INSERT INTO shipment_events (shipment_id, status, description) VALUES ($1, 'cancelled', $2)`,
            [shipRes.rows[0].id, reason ?? "Pedido cancelado pela loja"]
          );
        }
      });

      const emailSent = notifyEmail
        ? await sendOrderStatusEmail(
            { id: orderId, order_number: current.order_number, total: current.total, customer_email: current.customer_email, tracking_code: null, items: await fetchOrderEmailItems(db, orderId), reason },
            "order_cancelled"
          )
        : false;

      return ok({ updated: true, emailSent });
    }

    // Ação 3: mudar orders.status direto — só pros estados que não têm
    // fluxo de envio nenhum (reembolso é processado fora, no Mercado
    // Pago; isso aqui só registra). Cancelamento sempre passa pela ação 2
    // (garante restock); "preparing"/"shipped" não existem mais como
    // valor de orders.status — isso é responsabilidade só do envio.
    if (body.action === "set_order_status") {
      const allowed = ["paid", "delivered", "refunded"];
      const newStatus = String(body.status ?? "");
      if (!allowed.includes(newStatus)) return fail("INVALID_STATUS", 400);

      const orderRes = await db.query(
        `SELECT o.status, o.total, o.order_number, u.email AS customer_email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
        [orderId]
      );
      if (orderRes.rows.length === 0) return fail("ORDER_NOT_FOUND", 404);
      const current = orderRes.rows[0];
      if (current.status === newStatus) return ok({ updated: false, reason: "NO_CHANGE" });
      if (current.status === "cancelled") return fail("ORDER_CANCELLED", 409);

      await db.query(`UPDATE orders SET status = $1 WHERE id = $2`, [newStatus, orderId]);

      const emailSent = notifyEmail
        ? await sendOrderStatusEmail(
            { id: orderId, order_number: current.order_number, total: current.total, customer_email: current.customer_email, tracking_code: null, items: await fetchOrderEmailItems(db, orderId), reason },
            newStatus as NotificationEvent
          )
        : false;

      return ok({ updated: true, emailSent });
    }

    return fail("INVALID_ACTION", 400);
  } catch (error) {
    console.error("Erro ao atualizar pedido:", error);
    return fail("ORDER_UPDATE_ERROR", 500);
  }
}
