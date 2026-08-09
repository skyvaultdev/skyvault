"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !session.permissions.includes("chat.access")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const conversationId = Number(id);
  if (!conversationId) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const db = await getDB();
  await db.query(
    `INSERT INTO chat_typing (conversation_id, sender_type, sender_email, updated_at)
     VALUES ($1, 'staff', $2, now())
     ON CONFLICT (conversation_id, sender_email) DO UPDATE SET updated_at = now()`,
    [conversationId, session.email]
  );

  return NextResponse.json({ ok: true });
}