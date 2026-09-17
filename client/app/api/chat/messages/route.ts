"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";

// is_ticket = false garante que isso nunca reaproveita (nem cria em cima
// de) uma conversa de ticket aberta pro mesmo cliente — chat geral e
// tickets de pedido específico coexistem sem se misturar (ver
// app/api/chat/tickets/route.ts).
async function getOrCreateConversation(email: string) {
  const db = await getDB();
  const existing = await db.query(
    `SELECT id FROM chat_conversations WHERE customer_email = $1 AND is_ticket = false AND status = 'open' ORDER BY id DESC LIMIT 1`,
    [email]
  );
  if (existing.rows[0]) return existing.rows[0].id as number;

  const created = await db.query(
    `INSERT INTO chat_conversations (customer_email, status, last_message_at, is_ticket) VALUES ($1, 'open', now(), false) RETURNING id`,
    [email]
  );
  return created.rows[0].id as number;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const conversationId = await getOrCreateConversation(session.email);
  const db = await getDB();

  const { rows } = await db.query(
    `SELECT id, conversation_id, sender_type, sender_email, body,
            attachment_url, attachment_type, attachment_name, created_at
     FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId]
  );

  await db.query(
    `UPDATE chat_messages SET read_by_customer = true WHERE conversation_id = $1 AND sender_type = 'staff'`,
    [conversationId]
  );

  return NextResponse.json({ data: rows, conversationId });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json();
  const text = String(body?.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });

  const conversationId = await getOrCreateConversation(session.email);
  const db = await getDB();

  const { rows } = await db.query(
    `INSERT INTO chat_messages (conversation_id, sender_type, sender_email, body, read_by_customer)
     VALUES ($1, 'customer', $2, $3, true)
     RETURNING id, conversation_id, sender_type, sender_email, body,
               attachment_url, attachment_type, attachment_name, created_at`,
    [conversationId, session.email, text]
  );

  await db.query(
    `UPDATE chat_conversations SET last_message_at = now(), updated_at = now() WHERE id = $1`,
    [conversationId]
  );

  return NextResponse.json({ data: rows[0] });
}