import { getDB } from "@/lib/database/db";
import { getMailTransporter } from "@/lib/mail/transporter";

export type DeliveredDigitalItem = {
  productName: string;
  variationName?: string | null;
  type: "key" | "file" | "infinite";
  content: string; // key content, download path, or a display message
};

export async function sendOrderDeliveryEmail(params: {
  to: string;
  orderId: number;
  orderNumber?: string | null;
  items: DeliveredDigitalItem[];
}) {
  const orderRef = params.orderNumber || `#${params.orderId}`;
  const db = getDB();
  const storeResult = await db.query(
    `SELECT store_name, primary_color, secondary_color FROM store_settings ORDER BY id DESC LIMIT 1`
  );
  const store = storeResult.rows[0] ?? {};
  const storeName = store.store_name || "Minha Loja";
  const primaryColor = store.primary_color || "#7c3aed";

  const itemsHtml = params.items
    .map((item) => {
      const label = item.variationName ? `${item.productName} — ${item.variationName}` : item.productName;
      const contentHtml =
        item.type === "file"
          ? `<a href="${item.content}" style="color:${primaryColor};">Baixar arquivo</a>`
          : `<code style="background:#18181b;color:#fff;padding:6px 10px;border-radius:6px;display:inline-block;">${item.content}</code>`;

      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #27272a;">
            <p style="margin:0 0 6px 0;color:#fff;font-size:14px;font-weight:700;">${label}</p>
            <div style="font-size:13px;">${contentHtml}</div>
          </td>
        </tr>`;
    })
    .join("");

  const transporter = getMailTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: params.to,
    subject: `Seu pedido ${orderRef} foi confirmado • ${storeName}`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background-color:#09090b;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
        style="max-width:520px;background-color:#111113;border:1px solid #27272a;border-radius:18px;overflow:hidden;">
        <tr><td style="height:5px;background-color:${primaryColor};font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:30px 32px 10px 32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:22px;">${storeName}</h1>
          <p style="margin:8px 0 0 0;color:#a1a1aa;font-size:13px;">Pedido ${orderRef} confirmado</p>
        </td></tr>
        <tr><td style="padding:20px 32px 32px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            ${itemsHtml}
          </table>
          <p style="margin:20px 0 0 0;color:#71717a;font-size:12px;text-align:center;">
            Guarde este e-mail — ele contém os dados de acesso ao que você comprou.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
