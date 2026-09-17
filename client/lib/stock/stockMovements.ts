import type { Pool, PoolClient } from "pg";

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

// A tabela stock_movements é criada via migração manual
// (db/migrations/2026-09-17_stock_movements.sql), não auto-criada pelo
// código — rode essa migração no banco antes de usar esta feature.

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
