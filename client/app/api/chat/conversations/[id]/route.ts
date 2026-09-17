"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";
import { getMailTransporter } from "@/lib/mail/transporter";
import { loadStoreBranding, buildBrandedEmailHtml, emailParagraph } from "@/lib/mail/emailTemplate";

type Params = { params: Promise<{ id: string }> };

async function sendTicketClosedEmail(customerEmail: string, orderId: number | null) {
  const branding = await loadStoreBranding();
  if (!branding) return;

  const bodyHtml =
    emailParagraph(
      orderId
        ? `Seu ticket de suporte sobre o pedido <strong style="color:#fff;">#${orderId}</strong> foi encerrado pela nossa equipe.`
        : `Seu ticket de suporte foi encerrado pela nossa equipe.`
    ) + emailParagraph("Se o problema continuar ou surgir algo novo, é só abrir um novo ticket a qualquer momento.", true);

  const html = buildBrandedEmailHtml({
    branding,
    headerSubtitle: "Suporte",
    title: "Ticket encerrado",
    bodyHtml,
  });

  try {
    await getMailTransporter().sendMail({
      from: process.env.EMAIL_USER,
      to: customerEmail,
      subject: orderId ? `Ticket do pedido #${orderId} encerrado` : "Seu ticket de suporte foi encerrado",
      attachments: branding.logoAttachment ? [branding.logoAttachment] : [],
      html,
    });
  } catch (error) {
    console.error("Erro ao enviar email de ticket encerrado:", error);
  }
}

// Encerrar/reabrir ticket — só faz sentido pro staff (o cliente não decide
// quando o suporte foi resolvido). Serve tanto pra tickets quanto pra
// conversa geral, mas hoje só a aba "Tickets" do StaffChatPanel expõe esse
// botão. Ao encerrar um TICKET (não a conversa geral), o cliente recebe um
// email avisando — antes ele só descobria voltando a olhar o pedido.
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.permissions.includes("chat.access")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const conversationId = Number(id);
  if (!conversationId) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const status = body?.status === "closed" ? "closed" : body?.status === "open" ? "open" : null;
  if (!status) return NextResponse.json({ error: "STATUS_INVALIDO" }, { status: 400 });

  const db = await getDB();
  const before = await db.query(
    `SELECT status, is_ticket, customer_email, order_id FROM chat_conversations WHERE id = $1`,
    [conversationId]
  );
  if (before.rows.length === 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const previous = before.rows[0];

  const result = await db.query(
    `UPDATE chat_conversations SET status = $1, updated_at = now() WHERE id = $2 RETURNING id, status`,
    [status, conversationId]
  );

  if (status === "closed" && previous.is_ticket && previous.status !== "closed" && previous.customer_email) {
    await sendTicketClosedEmail(previous.customer_email, previous.order_id ?? null);
  }

  return NextResponse.json({ data: result.rows[0] });
}
