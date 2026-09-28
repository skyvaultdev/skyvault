import { getDB } from "@/lib/database/db";

// Auto-cria as colunas se a migração ainda não rodou — mesmo padrão usado
// em outras tabelas/colunas novas deste projeto (ver ensureOrderNumberColumn()
// em lib/orders/orderNumber.ts).
// Alerta ativo pra equipe: pedido pago com estoque insuficiente (faltaram
// itens) — antes isso só aparecia num console.error e numa nota do Registro
// de Estoque, fácil de passar batido.
export async function ensureOrderAttentionColumn() {
  await getDB().query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS attention_note TEXT`);
}

export async function ensureOrderItemDeliverySnapshotColumns() {
  const db = getDB();
  await db.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS delivered_content TEXT`);
  await db.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS delivered_file_size BIGINT`);
}
