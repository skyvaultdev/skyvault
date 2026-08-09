"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const db = await getDB();

  const existing = await db.query(
    `SELECT id FROM chat_conversations WHERE customer_email = $1 AND status = 'open' ORDER BY id DESC LIMIT 1`,
    [session.email]
  );
  if (!existing.rows[0]) return NextResponse.json({ ok: true });

  await db.query(
    `INSERT INTO chat_typing (conversation_id, sender_type, sender_email, updated_at)
     VALUES ($1, 'customer', $2, now())
     ON CONFLICT (conversation_id, sender_email) DO UPDATE SET updated_at = now()`,
    [existing.rows[0].id, session.email]
  );

  return NextResponse.json({ ok: true });
}