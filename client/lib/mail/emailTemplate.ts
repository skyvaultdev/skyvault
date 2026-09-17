import { readFile } from "fs/promises";
import path from "path";
import { getDB } from "@/lib/database/db";

export type StoreBranding = {
  storeName: string;
  primaryColor: string;
  secondaryColor: string;
  logoAttachment?: { filename: string; content: Buffer; cid: string };
  logoHtml: string;
};

// Centraliza a busca de store_settings + carregamento do logo, usado por
// todo email transacional (pedido, entrega, ticket) — antes essa lógica
// estava duplicada dentro de cada rota que mandava email.
export async function loadStoreBranding(): Promise<StoreBranding | null> {
  const db = getDB();
  const storeResult = await db.query(`
    SELECT store_name, primary_color, secondary_color, logo_url
    FROM store_settings
    ORDER BY id DESC
    LIMIT 1
  `);
  const store = storeResult.rows[0];
  if (!store) return null;

  const storeName = store.store_name || "Minha Loja";
  const primaryColor = store.primary_color || "#7c3aed";
  const secondaryColor = store.secondary_color || "#ffffff";

  let logoAttachment: StoreBranding["logoAttachment"];
  let logoHtml = "";

  if (store.logo_url) {
    try {
      const logoPath = path.join(process.cwd(), "public", store.logo_url.replace(/^\/+/, ""));
      const logoBuffer = await readFile(logoPath);
      logoAttachment = { filename: path.basename(logoPath), content: logoBuffer, cid: "store-logo" };
      logoHtml = `
        <img src="cid:store-logo" alt="${storeName}" width="160" style="display:block;width:160px;max-width:160px;height:auto;max-height:80px;object-fit:contain;margin:0 auto 18px auto;border:0;outline:none;text-decoration:none;">
      `;
    } catch (error) {
      console.error("Erro ao carregar logo da loja:", error);
    }
  }

  return { storeName, primaryColor, secondaryColor, logoAttachment, logoHtml };
}

// Parágrafo centralizado padrão do corpo do email — usado por todo
// conteúdo que monta bodyHtml.
export function emailParagraph(text: string, muted = false): string {
  return `<p style="margin:0 auto 16px auto;max-width:390px;text-align:center;color:${muted ? "#a1a1aa" : "#d4d4d8"};font-size:14px;line-height:1.7;">${text}</p>`;
}

// Lista de itens do pedido, formatada pro corpo do email — usada sempre
// que uma notificação precisa mostrar "o que" mudou, não só o número do
// pedido (ex: cancelamento, atualização de envio).
export function emailItemsList(items: Array<{ name: string; quantity: number }>): string {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:6px 0;color:#d4d4d8;font-size:13px;">${item.name}</td><td style="padding:6px 0;color:#a1a1aa;font-size:13px;text-align:right;">×${item.quantity}</td></tr>`
    )
    .join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 20px 0;max-width:390px;margin-left:auto;margin-right:auto;border-top:1px solid #27272a;border-bottom:1px solid #27272a;">
      ${rows}
    </table>
  `;
}

export function trackingCodeBox(code: string, primaryColor: string, secondaryColor: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 22px 0;">
      <tr>
        <td align="center" style="padding:0;">
          <div style="display:inline-block;min-width:190px;padding:16px 24px;box-sizing:border-box;background-color:${primaryColor};border-radius:12px;border:1px solid ${primaryColor};text-align:center;">
            <span style="color:${secondaryColor};font-size:22px;line-height:1;font-weight:700;letter-spacing:2px;font-family:Arial, Helvetica, sans-serif;">
              ${code}
            </span>
          </div>
        </td>
      </tr>
    </table>
  `;
}

// Monta o HTML completo do email a partir do miolo (título + corpo) — o
// wrapper (header com logo, rodapé) é sempre o mesmo, só o conteúdo muda.
export function buildBrandedEmailHtml(params: {
  branding: StoreBranding;
  headerSubtitle: string;
  title: string;
  bodyHtml: string;
}): string {
  const { branding, headerSubtitle, title, bodyHtml } = params;
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#09090b;font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;margin:0;padding:40px 16px;background-color:#09090b;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;max-width:500px;background-color:#111113;border:1px solid #27272a;border-radius:18px;overflow:hidden;">
          <tr>
            <td style="height:5px;padding:0;font-size:0;line-height:0;background-color:${branding.primaryColor};">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" style="padding:38px 32px 30px 32px;text-align:center;background-color:#111113;">
              ${branding.logoHtml}
              <h1 style="margin:0;padding:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-0.5px;">
                ${branding.storeName}
              </h1>
              <p style="margin:8px 0 0 0;padding:0;color:#a1a1aa;font-size:13px;line-height:1.5;">
                ${headerSubtitle}
              </p>
            </td>
          </tr>
          <tr>
            <td style="height:1px;padding:0;background-color:#27272a;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:34px 32px 36px 32px;background-color:#111113;">
              <h2 style="margin:0 0 20px 0;padding:0;text-align:center;color:${branding.secondaryColor};font-size:21px;line-height:1.4;font-weight:700;">
                ${title}
              </h2>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:22px 24px;text-align:center;background-color:#0d0d0f;border-top:1px solid #27272a;">
              <p style="margin:0;padding:0;color:#52525b;font-size:11px;line-height:1.6;">
                © ${new Date().getFullYear()} ${branding.storeName}
              </p>
              <p style="margin:5px 0 0 0;padding:0;color:#3f3f46;font-size:10px;line-height:1.5;">
                Este e-mail foi enviado automaticamente.
              </p>
            </td>
          </tr>
        </table>
        <p style="max-width:500px;margin:18px auto 0 auto;padding:0 16px;text-align:center;color:#52525b;font-size:10px;line-height:1.5;">
          Mensagem automática sobre seu pedido.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}
