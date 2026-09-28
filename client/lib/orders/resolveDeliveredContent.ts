import type { Pool } from "pg";

export type OrderItemRow = {
  id: number;
  product_id: number | null;
  variation_id: number | null;
  product_type: string;
  delivered_at: string | Date | null;
  delivered_content: string | null;
  delivered_file_size: number | string | null; // BIGINT — o driver pg devolve como string
};

// Resolve o que foi REALMENTE entregue num item de pedido digital, usada
// tanto na tela do cliente (checkout/order/[id]) quanto no detalhe do
// pedido na dashboard (admin/orders/[id]) — mesma prioridade nos dois
// lugares: stock_keys (permanente, só existe se o item vendido era tipo
// "key") → snapshot gravado em order_items na entrega (migração
// 2026-09-22) → produto ao vivo, só como fallback pra pedidos entregues
// antes dessa migração existir.
export async function resolveDeliveredContent(
  db: Pool,
  orderId: number,
  item: OrderItemRow
): Promise<{ deliveredContent: string[] | null; deliveredFileSize: number | null }> {
  if (!item.delivered_at || item.product_type !== "digital") {
    return { deliveredContent: null, deliveredFileSize: null };
  }

  const isVariation = item.variation_id != null;
  const targetId = isVariation ? item.variation_id : item.product_id;

  if (targetId) {
    const keyColumn = isVariation ? "variation_id" : "product_id";
    const keysRes = await db.query(
      `SELECT key_content FROM stock_keys WHERE order_id = $1 AND ${keyColumn} = $2`,
      [orderId, targetId]
    );
    if (keysRes.rows.length > 0) {
      return { deliveredContent: keysRes.rows.map((r) => r.key_content), deliveredFileSize: null };
    }
  }

  if (item.delivered_content) {
    // Convenção do snapshot (ver confirmOrderPayment.ts): tipo "file"
    // grava o caminho completo com esse prefixo; "infinite" grava a
    // mensagem crua.
    const deliveredFileSize = item.delivered_content.startsWith("/api/files/products/uploads/") && item.delivered_file_size != null
      ? Number(item.delivered_file_size)
      : null;
    return { deliveredContent: [item.delivered_content], deliveredFileSize };
  }

  if (targetId) {
    const table = isVariation ? "product_variations" : "products";
    const infoRes = await db.query(`SELECT stock_type, stock_content FROM ${table} WHERE id = $1`, [targetId]);
    const info = infoRes.rows[0];
    if (info?.stock_type === "file") {
      return { deliveredContent: [`/api/files/products/uploads/${info.stock_content}`], deliveredFileSize: null };
    }
    if (info) {
      return { deliveredContent: [info.stock_content || "Entrega automática ativada"], deliveredFileSize: null };
    }
  }

  return { deliveredContent: null, deliveredFileSize: null };
}
