import type { Pool, PoolClient } from "pg";
import { getDB } from "@/lib/database/db";

export type StockMovementReason =
  | "sale"              // baixa automática por venda confirmada
  | "cancel_restock"    // devolução ao estoque por cancelamento/devolução de pedido
  | "manual_adjustment" // staff editou/registrou estoque manualmente (produto ou variação)
  | "product_created";  // estoque inicial definido na criação do produto

export const STOCK_MOVEMENT_REASON_LABELS: Record<StockMovementReason, string> = {
  sale: "Venda",
  cancel_restock: "Estorno (cancelamento/devolução)",
  manual_adjustment: "Ajuste manual",
  product_created: "Cadastro inicial",
};

// Auto-cria a tabela/índices se a migração (db/migrations/2026-09-17_stock_movements.sql)
// ainda não rodou — mesmo padrão usado em outras tabelas/colunas novas
// deste projeto (ver ensureOrderNumberColumn() em lib/orders/orderNumber.ts).
// Sem isso, um ambiente novo/staging/restore de backup sem essa migração
// aplicada faz todo INSERT aqui falhar — e como logStockMovement roda
// dentro da MESMA transação de confirmOrderPayment, isso reverte a baixa
// de estoque e a entrega inteira do pedido (o cliente já cobrado não
// recebe nada). SQL idêntico ao do arquivo de migração — mantenha os dois
// em sincronia se o schema mudar.
export async function ensureStockMovementsTable() {
  const db = getDB();
  await db.query(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      variation_id INTEGER REFERENCES product_variations(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      variation_name TEXT,
      change INTEGER NOT NULL,
      reason TEXT NOT NULL,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      note TEXT,
      staff_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements (product_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS stock_movements_order_idx ON stock_movements (order_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON stock_movements (created_at DESC)`);
}

// Chamado de dentro das mesmas transações que já mexem em stock_count —
// aceita Pool ou um client de transação em andamento (withTransaction),
// pra a entrada no ledger nunca ficar dessincronizada da mudança real.
export async function logStockMovement(
  client: Pool | PoolClient,
  params: {
    productId: number | null;
    variationId?: number | null;
    productName: string;
    variationName?: string | null;
    change: number;
    reason: StockMovementReason;
    orderId?: number | null;
    note?: string | null;
    staffEmail?: string | null;
  }
) {
  // change=0 normalmente não vale a pena gravar (nada mudou de verdade) —
  // exceto quando vem com uma nota (ex: estoque já esgotado, nada a
  // decrementar), onde o "nada mudou" É a informação relevante.
  if (params.change === 0 && !params.note) return;
  await client.query(
    `INSERT INTO stock_movements
       (product_id, variation_id, product_name, variation_name, change, reason, order_id, note, staff_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.productId, params.variationId ?? null, params.productName, params.variationName ?? null,
      params.change, params.reason, params.orderId ?? null, params.note ?? null, params.staffEmail ?? null,
    ]
  );
}
