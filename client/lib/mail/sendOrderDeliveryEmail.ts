import { getDB } from "@/lib/database/db";
import { getMailTransporter } from "@/lib/mail/transporter";
import { signDownloadToken } from "@/lib/mail/downloadToken";
import { config } from "@/config/configuration";

export type DeliveredDigitalItem = {
  productName: string;
  variationName?: string | null;
  type: "key" | "file" | "infinite";
  content: string; // key content, download path, or a display message
  fileSize?: number | null; // bytes — só preenchido pra type "file"
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Prefixo usado em confirmOrderPayment.ts pra montar o link de arquivo —
// se isso mudar lá, tem que mudar aqui também.
const FILE_DOWNLOAD_PREFIX = "/api/files/products/uploads/";

export async function sendOrderDeliveryEmail(params: {
  to: string;
  orderId: number;
  orderNumber?: string | null;
  items: DeliveredDigitalItem[];
}) {
  const orderRef = params.orderNumber || `#${params.orderId}`;
  const db = getDB();
  const [storeResult, orderResult] = await Promise.all([
    db.query(`SELECT store_name, primary_color, secondary_color FROM store_settings ORDER BY id DESC LIMIT 1`),
    db.query(`SELECT total, paid_at, created_at FROM orders WHERE id = $1`, [params.orderId]),
  ]);
  const store = storeResult.rows[0] ?? {};
  const storeName = store.store_name || "Minha Loja";
  const primaryColor = store.primary_color || "#7c3aed";
  const orderRow = orderResult.rows[0];
  const paidAtLabel = orderRow?.paid_at
    ? new Date(orderRow.paid_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : null;
  const totalLabel = orderRow?.total != null
    ? `R$ ${Number(orderRow.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : null;

  const itemsHtml = (
    await Promise.all(
      params.items.map(async (item) => {
        const label = item.variationName ? `${item.productName} — ${item.variationName}` : item.productName;
        let contentHtml: string;

        if (item.type === "file") {
          // Link assinado com validade própria (7 dias) — diferente do
          // resto do app, esse link é aberto de um e-mail, num dispositivo
          // que pode não ter sessão logada nenhuma. Sem isso o cliente
          // tomava 401 ao abrir o link do celular sem estar logado no site.
          // Aponta pra página intermediária (app/(public)/download), não
          // direto pra rota da API — aberta fora do app (cliente de email),
          // ela dispara o download via blob e explica que já pode fechar a
          // aba, em vez de só navegar até o arquivo cru.
          let href = item.content;
          if (item.content.startsWith(FILE_DOWNLOAD_PREFIX)) {
            const filename = item.content.slice(FILE_DOWNLOAD_PREFIX.length);
            const downloadToken = await signDownloadToken(params.orderId, filename);
            href = `${config.WEBSITE_URL}/download?token=${downloadToken}&file=${encodeURIComponent(filename)}`;
          }
          const sizeLabel = item.fileSize != null ? ` <span style="color:#71717a;">(${formatFileSize(item.fileSize)})</span>` : "";
          contentHtml = `<a href="${href}" style="color:${primaryColor};">Baixar arquivo</a>${sizeLabel}`;
        } else {
          contentHtml = `<code style="background:#18181b;color:#fff;padding:6px 10px;border-radius:6px;display:inline-block;">${item.content}</code>`;
        }

        return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #27272a;">
            <p style="margin:0 0 6px 0;color:#fff;font-size:14px;font-weight:700;">${label}</p>
            <div style="font-size:13px;">${contentHtml}</div>
          </td>
        </tr>`;
      })
    )
  ).join("");

  // Bloco de comprovante — número do pedido, data e valor pago em destaque,
  // pra esse email servir também como referência caso o cliente precise
  // mencionar o pedido em algum contato de suporte.
  const receiptHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#18181b;border-radius:10px;margin-bottom:18px;">
      <tr>
        <td style="padding:14px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="color:#a1a1aa;font-size:12px;padding:3px 0;">Número do pedido</td>
              <td align="right" style="color:#fff;font-size:12px;font-weight:700;padding:3px 0;">${orderRef}</td>
            </tr>
            ${paidAtLabel ? `<tr>
              <td style="color:#a1a1aa;font-size:12px;padding:3px 0;">Data do pagamento</td>
              <td align="right" style="color:#fff;font-size:12px;padding:3px 0;">${paidAtLabel}</td>
            </tr>` : ""}
            ${totalLabel ? `<tr>
              <td style="color:#a1a1aa;font-size:12px;padding:3px 0;">Total pago</td>
              <td align="right" style="color:#fff;font-size:12px;font-weight:700;padding:3px 0;">${totalLabel}</td>
            </tr>` : ""}
          </table>
        </td>
      </tr>
    </table>`;

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
          ${receiptHtml}
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            ${itemsHtml}
          </table>
          <p style="margin:20px 0 0 0;color:#71717a;font-size:12px;text-align:center;">
            Guarde este e-mail — ele contém os dados de acesso ao que você comprou.
          </p>
          <p style="margin:10px 0 0 0;color:#71717a;font-size:12px;text-align:center;">
            Precisa de ajuda com esse pedido? Acesse
            <a href="${config.WEBSITE_URL}/orders" style="color:${primaryColor};">Meus pedidos</a>
            no site e abra um chamado de suporte — informe o pedido ${orderRef}.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
