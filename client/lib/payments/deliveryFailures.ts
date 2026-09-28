import { getDB } from "@/lib/database/db";

export type DeliveryFailureStage = "checkout_pay" | "webhook" | "check_payment" | "mock_confirm_payment";

// Auto-cria a tabela se a migração (db/migrations/2026-09-18_delivery_failures.sql)
// ainda não rodou — mesmo padrão usado nas outras tabelas novas deste
// projeto (ver ensureStockMovementsTable() em lib/stock/stockMovements.ts).
export async function ensureDeliveryFailuresTable() {
  const db = getDB();
  await db.query(`
    CREATE TABLE IF NOT EXISTS delivery_failures (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      error_message TEXT,
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS delivery_failures_order_idx ON delivery_failures (order_id)`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS delivery_failures_unresolved_idx ON delivery_failures (resolved_at) WHERE resolved_at IS NULL`
  );
}

// Registrado sempre que confirmOrderPayment falha DEPOIS de o Mercado Pago
// já ter aprovado o pagamento — dinheiro já foi cobrado, então isso nunca
// pode só desaparecer num console.error. Fica marcado aqui pra alguém
// (staff, ou um alerta futuro) reconciliar manualmente: reprocessar
// confirmOrderPayment(orderId) assim que a causa raiz for corrigida.
export async function logDeliveryFailure(orderId: number, stage: DeliveryFailureStage, error: unknown) {
  await ensureDeliveryFailuresTable();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const db = getDB();
  await db.query(
    `INSERT INTO delivery_failures (order_id, stage, error_message) VALUES ($1, $2, $3)`,
    [orderId, stage, errorMessage]
  );
  console.error(`[delivery_failures] pedido #${orderId}: FALHA DE ENTREGA registrada (stage=${stage}) —`, error);
}
