import { getMailTransporter } from "@/lib/mail/transporter";
import { loadStoreBranding, buildBrandedEmailHtml, emailParagraph } from "@/lib/mail/emailTemplate";
import { config } from "@/config/configuration";

// Disparado só no PRIMEIRO cadastro (ver os 3 callbacks de login —
// google/discord/email — que checam se o INSERT em users realmente
// criou uma linha nova, via RETURNING, antes de chamar isto). Nunca
// bloqueia o login: sempre fire-and-forget (.catch), mesmo padrão dos
// outros emails não-críticos deste projeto.
export async function sendWelcomeEmail(params: { to: string; name?: string | null }): Promise<boolean> {
  const branding = await loadStoreBranding();
  if (!branding) {
    console.error("Não foi possível enviar email de boas-vindas: store_settings não encontrado.");
    return false;
  }

  const greeting = params.name ? `Olá, ${params.name}!` : "Olá!";
  const bodyHtml =
    emailParagraph(`${greeting} Sua conta na <strong style="color:#fff;">${branding.storeName}</strong> foi criada com sucesso.`) +
    emailParagraph("Já pode navegar pelo catálogo e fazer seu primeiro pedido.", true) +
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:8px;">
      <tr><td align="center">
        <a href="${config.WEBSITE_URL}" style="display:inline-block;padding:12px 28px;background-color:${branding.primaryColor};color:${branding.secondaryColor};border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;">Ir para a loja</a>
      </td></tr>
    </table>`;

  const html = buildBrandedEmailHtml({
    branding,
    headerSubtitle: "Boas-vindas",
    title: "Sua conta foi criada!",
    bodyHtml,
  });

  try {
    await getMailTransporter().sendMail({
      from: process.env.EMAIL_USER,
      to: params.to,
      subject: `Bem-vindo(a) à ${branding.storeName}!`,
      attachments: branding.logoAttachment ? [branding.logoAttachment] : [],
      html,
    });
    return true;
  } catch (error) {
    console.error(`Erro ao enviar email de boas-vindas para ${params.to}:`, error);
    return false;
  }
}
