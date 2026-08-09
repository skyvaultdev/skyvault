"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.permissions.includes("chat.access")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const conversationId = Number(id);
  if (!conversationId) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const db = await getDB();
  const { rows } = await db.query(
    `SELECT id, conversation_id, sender_type, sender_email, body,
            attachment_url, attachment_type, attachment_name, created_at
     FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId]
  );

  await db.query(
    `UPDATE chat_messages SET read_by_staff = true WHERE conversation_id = $1 AND sender_type = 'customer'`,
    [conversationId]
  );

  return NextResponse.json({ data: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.permissions.includes("chat.access")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const conversationId = Number(id);
  if (!conversationId) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const body = await req.json();
  const text = String(body?.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });

  const db = await getDB();
  const { rows } = await db.query(
    `INSERT INTO chat_messages (conversation_id, sender_type, sender_email, body, read_by_staff)
     VALUES ($1, 'staff', $2, $3, true)
     RETURNING id, conversation_id, sender_type, sender_email, body,
               attachment_url, attachment_type, attachment_name, created_at`,
    [conversationId, session.email, text]
  );

  await db.query(
    `UPDATE chat_conversations SET last_message_at = now(), updated_at = now(), assigned_admin_email = $2 WHERE id = $1`,
    [conversationId, session.email]
  );

  return NextResponse.json({ data: rows[0] });
}