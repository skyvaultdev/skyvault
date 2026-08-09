"use server";

import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado.", { status: 401 });

  const db = await getDB();
  const convoRes = await db.query(
    `SELECT id FROM chat_conversations WHERE customer_email = $1 AND status = 'open' ORDER BY id DESC LIMIT 1`,
    [session.email]
  );
  const conversationId = convoRes.rows[0]?.id;
  if (!conversationId) return new Response("Sem conversa.", { status: 404 });

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
             WHERE conversation_id = $1 AND sender_type = 'customer' AND read_by_staff = true`,
            [conversationId]
          );
          for (const row of readRows) {
            const numericId = Number(row.id);
            if (!readSeen.has(numericId)) {
              readSeen.add(numericId);
              send("read", { messageId: numericId });
            }
          }

          const { rows: typingRows } = await db.query(
            `SELECT 1 FROM chat_typing
             WHERE conversation_id = $1 AND sender_type = 'staff' AND updated_at > now() - interval '4 seconds'`,
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