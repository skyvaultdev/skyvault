import { getDB } from "@/lib/database/db";
import { getMailTransporter } from "@/lib/mail/transporter";
import { loadStoreBranding, buildBrandedEmailHtml, emailParagraph, emailItemsList } from "@/lib/mail/emailTemplate";
import { config } from "@/config/configuration";

export type AbandonedCartEmailResult = {
  emailsSent: number;
  failures: Array<{ userId: number; error: string }>;
};

type AbandonedCartRow = {
  user_id: number;
  email: string;
  item_count: string;
  cart_value: string;
  items: Array<{ name: string; quantity: number }>;
};

// Carrinho "abandonado" = cart_items que não muda há N horas — mesma
// definição usada em app/api/admin/pending-carts/route.ts (que só EXIBE
// pro staff; isso aqui age, mandando um lembrete pro cliente). Só manda
// uma vez por versão do carrinho: recovery_email_sent_at marca os itens já
// avisados, então só reenviaria se o cliente adicionar/mudar algo depois
// do último lembrete (ver WHERE/HAVING abaixo).
export async function sendAbandonedCartEmails(
  hours: number = config.orders.abandonedCartHours
): Promise<AbandonedCartEmailResult> {
  const db = getDB();
  const failures: AbandonedCartEmailResult["failures"] = [];
  let emailsSent = 0;

  const result = await db.query<AbandonedCartRow>(
    `SELECT
       u.id AS user_id, u.email,
       COUNT(c.id) AS item_count,
       SUM(COALESCE(v.price, p.price) * c.quantity) AS cart_value,
       json_agg(json_build_object('name', p.name, 'quantity', c.quantity) ORDER BY c.id) AS items
     FROM cart_items c
     JOIN users u ON u.id = c.user_id
     JOIN products p ON p.id = c.product_id
     LEFT JOIN product_variations v ON v.id = c.variation_id
     WHERE u.email IS NOT NULL
     GROUP BY u.id, u.email
     HAVING MAX(c.updated_at) < NOW() - ($1 || ' hours')::interval
        AND bool_or(c.recovery_email_sent_at IS NULL)`,
    [hours]
  );

  const branding = await loadStoreBranding();
  if (!branding) {
    failures.push({ userId: 0, error: "store_settings não encontrado — não dá pra montar o e-mail." });
    return { emailsSent, failures };
  }

  for (const row of result.rows) {
    const userId = Number(row.user_id);
    try {
      const html = buildBrandedEmailHtml({
        branding,
        headerSubtitle: "Você esqueceu algo",
        title: "Seu carrinho está te esperando",
        bodyHtml:
          emailParagraph(`Você deixou ${row.item_count} item(ns) no carrinho da ${branding.storeName}.`) +
          emailItemsList(row.items) +
          emailParagraph(
            `Total: <strong style="color:#fff;">R$ ${Number(row.cart_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>. Volte quando quiser pra finalizar a compra.`,
            true
          ) +
          emailParagraph(`<a href="${config.WEBSITE_URL}/checkout" style="color:${branding.primaryColor};">Finalizar compra</a>`),
      });

      await getMailTransporter().sendMail({
        from: process.env.EMAIL_USER,
        to: row.email,
        subject: `Você esqueceu algo na ${branding.storeName}`,
        attachments: branding.logoAttachment ? [branding.logoAttachment] : [],
        html,
      });

      await db.query(`UPDATE cart_items SET recovery_email_sent_at = NOW() WHERE user_id = $1`, [userId]);
      emailsSent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[sendAbandonedCartEmails] falha ao enviar pro usuário #${userId}:`, message);
      failures.push({ userId, error: message });
    }
  }

  return { emailsSent, failures };
}
