"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const MAX_SIZE = 15 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "video/mp4"];

async function getOrCreateConversation(email: string) {
  const db = await getDB();
  const existing = await db.query(
    `SELECT id FROM chat_conversations WHERE customer_email = $1 AND status = 'open' ORDER BY id DESC LIMIT 1`,
    [email]
  );
  if (existing.rows[0]) return existing.rows[0].id as number;

  const created = await db.query(
    `INSERT INTO chat_conversations (customer_email, status, last_message_at) VALUES ($1, 'open', now()) RETURNING id`,
    [email]
  );
  return created.rows[0].id as number;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Arquivo muito grande (máx 15MB)." }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Tipo de arquivo não permitido." }, { status: 400 });

  const ext = path.extname(file.name) || "";
  const filename = `${randomUUID()}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "chat");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()));
  const url = `/uploads/chat/${filename}`;

  const conversationId = await getOrCreateConversation(session.email);
  const db = await getDB();

  const { rows } = await db.query(
    `INSERT INTO chat_messages (conversation_id, sender_type, sender_email, body, attachment_url, attachment_type, attachment_name, read_by_customer)
     VALUES ($1, 'customer', $2, '', $3, $4, $5, true)
     RETURNING id, conversation_id, sender_type, sender_email, body, attachment_url, attachment_type, attachment_name, created_at`,
    [conversationId, session.email, url, file.type, file.name]
  );

  await db.query(
    `UPDATE chat_conversations SET last_message_at = now(), updated_at = now() WHERE id = $1`,
    [conversationId]
  );

  return NextResponse.json({ data: rows[0] });
}