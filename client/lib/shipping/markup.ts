import { getDB } from "@/lib/database/db";

// Compartilhado entre todos os ShippingProvider — a taxa de markup é uma
// política da loja, não do provedor de frete, então tem que valer igual
// seja a cotação vindo da tabela fixa ou de uma API real (Melhor Envio).
export async function applyShippingMarkup(price: number): Promise<number> {
  const db = getDB();
  const settingsRes = await db.query(
    `SELECT shipping_markup_percent, shipping_markup_fixed FROM store_settings ORDER BY id DESC LIMIT 1`
  );
  const settings = settingsRes.rows[0] ?? { shipping_markup_percent: 0, shipping_markup_fixed: 0 };

  return (
    Math.round(
      (price * (1 + Number(settings.shipping_markup_percent) / 100) + Number(settings.shipping_markup_fixed)) * 100
    ) / 100
  );
}
