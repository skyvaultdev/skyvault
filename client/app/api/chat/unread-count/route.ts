"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";

// Separado por is_ticket de propósito — antes um ticket com mensagem nova
// inflava a "bolinha" de Chats sem indicar que era um ticket (e vice-versa).
export async function GET() {
  const session = await getSession();
  if (!session || !session.permissions.includes("chat.access")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const db = await getDB();
  const { rows } = await db.query(`
    SELECT c.is_ticket, COUNT(*) AS count
    FROM chat_messages m
    JOIN chat_conversations c ON c.id = m.conversation_id
    WHERE c.status = 'open' AND m.sender_type = 'customer' AND m.read_by_staff = false
    GROUP BY c.is_ticket
  `);

  let chats = 0;
  let tickets = 0;
  for (const row of rows) {
    if (row.is_ticket) tickets = Number(row.count);
    else chats = Number(row.count);
  }

  return NextResponse.json({ chats, tickets, count: chats + tickets });
}
