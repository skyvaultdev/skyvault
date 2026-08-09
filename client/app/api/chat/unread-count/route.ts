"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";

export async function GET() {
  const session = await getSession();
  if (!session || !session.permissions.includes("chat.access")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const db = await getDB();
  const { rows } = await db.query(`
    SELECT COUNT(*) AS count
    FROM chat_messages m
    JOIN chat_conversations c ON c.id = m.conversation_id
    WHERE c.status = 'open' AND m.sender_type = 'customer' AND m.read_by_staff = false
  `);

  return NextResponse.json({ count: Number(rows[0]?.count ?? 0) });
}