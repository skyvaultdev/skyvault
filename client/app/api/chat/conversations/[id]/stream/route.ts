"use server";

import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !session.permissions.includes("chat.access")) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const { id } = await params;
  const conversationId = Number(id);
  const db = await getDB();
  const encoder = new TextEncoder();

  let lastMessageId = 0;
  const readSeen = new Set<number>();
  let typingActive = false;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const interval = setInterval(async () => {
        try {
          const { rows: newMessages } = await db.query(
            `SELECT id, conversation_id, sender_type, sender_email, body, attachment_url, attachment_type, attachment_name, created_at
             FROM chat_messages WHERE conversation_id = $1 AND id > $2 ORDER BY id ASC`,
            [conversationId, lastMessageId]
          );
          for (const row of newMessages) {
            lastMessageId = row.id;
            send("message", row);
          }

          const { rows: readRows } = await db.query(
            `SELECT id FROM chat_messages
             WHERE conversation_id = $1 AND sender_type = 'staff' AND read_by_customer = true`,
            [conversationId]
          );
          for (const row of readRows) {
            if (!readSeen.has(row.id)) {
              readSeen.add(row.id);
              send("read", { messageId: row.id });
            }
          }

          const { rows: typingRows } = await db.query(
            `SELECT 1 FROM chat_typing
             WHERE conversation_id = $1 AND sender_type = 'customer' AND updated_at > now() - interval '4 seconds'`,
            [conversationId]
          );
          const active = typingRows.length > 0;
          if (active !== typingActive) {
            typingActive = active;
            send("typing", { active });
          }
        } catch {
          // tenta de novo no próximo tick
        }
      }, 1500);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}