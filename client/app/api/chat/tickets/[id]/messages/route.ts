"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { requireCustomer } from "@/lib/auth/customer";

type Params = { params: Promise<{ id: string }> };

async function loadOwnedTicket(conversationId: number, email: string) {
  const db = getDB();
  const res = await db.query(
    `SELECT id, status FROM chat_conversations WHERE id = $1 AND customer_email = $2 AND is_ticket = true`,
    [conversationId, email]
  );
  return res.rows[0] ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const { email, denied } = await requireCustomer();
  if (denied) return denied;

  const { id } = await params;
  const conversationId = Number(id);
  if (!conversationId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

  const ticket = await loadOwnedTicket(conversationId, email!);
  if (!ticket) return NextResponse.json({ error: "TICKET_NOT_FOUND" }, { status: 404 });

  const db = getDB();
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

  return NextResponse.json({ data: rows, status: ticket.status });
}

export async function POST(req: Request, { params }: Params) {
  const { email, denied } = await requireCustomer();
  if (denied) return denied;

  const { id } = await params;
  const conversationId = Number(id);
  if (!conversationId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

  const ticket = await loadOwnedTicket(conversationId, email!);
  if (!ticket) return NextResponse.json({ error: "TICKET_NOT_FOUND" }, { status: 404 });
  if (ticket.status !== "open") return NextResponse.json({ error: "TICKET_CLOSED" }, { status: 409 });

  const body = await req.json();
  const text = String(body?.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 });

  const db = getDB();
  const { rows } = await db.query(
    `INSERT INTO chat_messages (conversation_id, sender_type, sender_email, body, read_by_customer)
     VALUES ($1, 'customer', $2, $3, true)
     RETURNING id, conversation_id, sender_type, sender_email, body,
               attachment_url, attachment_type, attachment_name, created_at`,
    [conversationId, email, text]
  );

  await db.query(
    `UPDATE chat_conversations SET last_message_at = now(), updated_at = now() WHERE id = $1`,
    [conversationId]
  );

  return NextResponse.json({ data: rows[0] });
}
