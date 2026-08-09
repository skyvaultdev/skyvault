"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const MAX_SIZE = 15 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "video/mp4"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !session.permissions.includes("chat.access")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const conversationId = Number(id);
  if (!conversationId) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

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

  const db = await getDB();
  const { rows } = await db.query(
    `INSERT INTO chat_messages (conversation_id, sender_type, sender_email, body, attachment_url, attachment_type, attachment_name, read_by_staff)
     VALUES ($1, 'staff', $2, '', $3, $4, $5, true)
     RETURNING id, conversation_id, sender_type, sender_email, body, attachment_url, attachment_type, attachment_name, created_at`,
    [conversationId, session.email, url, file.type, file.name]
  );

  await db.query(
    `UPDATE chat_conversations SET last_message_at = now(), updated_at = now(), assigned_admin_email = $2 WHERE id = $1`,
    [conversationId, session.email]
  );

  return NextResponse.json({ data: rows[0] });
}