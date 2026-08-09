"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.permissions.includes("chat.access")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const db = await getDB();
  const { rows } = await db.query(`
    SELECT
      c.id, c.customer_email, c.status, c.last_message_at,
      COALESCE(u.username, d.username, g.username) AS customer_name,
      COUNT(m.id) FILTER (WHERE m.read_by_staff = false AND m.sender_type = 'customer') AS unread_count
    FROM chat_conversations c
    LEFT JOIN users u ON u.email = c.customer_email
    LEFT JOIN discuser d ON d.email = c.customer_email
    LEFT JOIN googleuser g ON g.email = c.customer_email
    LEFT JOIN chat_messages m ON m.conversation_id = c.id
    WHERE c.status = 'open'
    GROUP BY c.id, u.username, d.username, g.username
    ORDER BY c.last_message_at DESC NULLS LAST
  `);

  const data = rows.map((r: any) => ({ ...r, id: Number(r.id), unread_count: Number(r.unread_count) }));
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.permissions.includes("chat.access")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const body = await req.json();
  const email = String(body?.email ?? "").trim();
  if (!email) return NextResponse.json({ error: "Email inválido." }, { status: 400 });

  const db = await getDB();
  const existing = await db.query(
    `SELECT id, status FROM chat_conversations WHERE customer_email = $1 ORDER BY id DESC LIMIT 1`,
    [email]
  );

  let conversationId: number;
  if (existing.rows[0]) {
    conversationId = Number(existing.rows[0].id);
    if (existing.rows[0].status !== "open") {
      await db.query(`UPDATE chat_conversations SET status = 'open', updated_at = now() WHERE id = $1`, [conversationId]);
    }
  } else {
    const created = await db.query(
      `INSERT INTO chat_conversations (customer_email, status, last_message_at) VALUES ($1, 'open', now()) RETURNING id`,
      [email]
    );
    conversationId = Number(created.rows[0].id);
  }

  return NextResponse.json({ data: { id: conversationId } });
}