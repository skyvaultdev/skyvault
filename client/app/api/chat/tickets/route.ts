"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { requireCustomer } from "@/lib/auth/customer";

// Verifica se já existe um ticket (aberto OU encerrado) pra esse pedido —
// usado pra carregar o chat automaticamente ao abrir o pedido em vez de
// exigir clicar em "abrir ticket" de novo (que só encontra tickets ABERTOS
// e criaria um segundo, novo, se o antigo já tivesse sido encerrado).
export async function GET(req: Request) {
  const { userId, denied } = await requireCustomer();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const orderId = Number(searchParams.get("orderId"));
  if (!orderId) return NextResponse.json({ error: "INVALID_ORDER_ID" }, { status: 400 });

  const db = getDB();
  const orderRes = await db.query(`SELECT id FROM orders WHERE id = $1 AND user_id = $2`, [orderId, userId]);
  if (orderRes.rows.length === 0) return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

  const emailRes = await db.query(`SELECT email FROM users WHERE id = $1`, [userId]);
  const email = emailRes.rows[0]?.email as string;

  const existing = await db.query(
    `SELECT id, status FROM chat_conversations
     WHERE customer_email = $1 AND order_id = $2 AND is_ticket = true
     ORDER BY id DESC LIMIT 1`,
    [email, orderId]
  );

  if (!existing.rows[0]) return NextResponse.json({ data: null });
  return NextResponse.json({ data: { conversationId: existing.rows[0].id, status: existing.rows[0].status } });
}

// Cria (ou reabre) um ticket de suporte amarrado a um pedido específico do
// cliente logado. É uma chat_conversations com is_ticket=true — separada da
// conversa "geral" de suporte do mesmo cliente (getOrCreateConversation em
// chat/messages/route.ts só busca conversas com is_ticket=false), então as
// duas podem existir abertas ao mesmo tempo sem se misturar.
export async function POST(req: Request) {
  const { userId, denied } = await requireCustomer();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const orderId = Number(body?.orderId);
  if (!orderId) return NextResponse.json({ error: "INVALID_ORDER_ID" }, { status: 400 });

  const db = getDB();

  // Comparação de dono feita no SQL (não em JS) de propósito — user_id é
  // BIGINT, o driver pg devolve BIGINT como string, e comparar isso contra
  // um `number` em JS com !== falha silenciosamente. Mesmo padrão de
  // checkout/order/[id] e checkout/pay/[orderId].
  const orderRes = await db.query(`SELECT id FROM orders WHERE id = $1 AND user_id = $2`, [orderId, userId]);
  const order = orderRes.rows[0];
  if (!order) {
    return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
  }

  const emailRes = await db.query(`SELECT email FROM users WHERE id = $1`, [userId]);
  const email = emailRes.rows[0]?.email as string;

  const existing = await db.query(
    `SELECT id FROM chat_conversations
     WHERE customer_email = $1 AND order_id = $2 AND is_ticket = true AND status = 'open'
     ORDER BY id DESC LIMIT 1`,
    [email, orderId]
  );

  if (existing.rows[0]) {
    return NextResponse.json({ data: { conversationId: existing.rows[0].id } });
  }

  const created = await db.query(
    `INSERT INTO chat_conversations (customer_email, status, last_message_at, order_id, is_ticket)
     VALUES ($1, 'open', now(), $2, true)
     RETURNING id`,
    [email, orderId]
  );

  return NextResponse.json({ data: { conversationId: created.rows[0].id } });
}
