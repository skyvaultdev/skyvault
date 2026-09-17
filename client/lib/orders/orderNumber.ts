import crypto from "crypto";
import type { Pool, PoolClient } from "pg";
import { getDB } from "@/lib/database/db";

// Sem 0/O/1/I/L — costumam ser confundidos entre si quando o cliente
// digita/lê o número em voz alta pro suporte.
const CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LENGTH = 8;

function randomOrderNumber(): string {
  const bytes = crypto.randomBytes(LENGTH);
  let out = "";
  for (let i = 0; i < LENGTH; i++) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  return out;
}

// Auto-cria a coluna/índice se a migração ainda não rodou — mesmo padrão
// usado em outras tabelas/colunas novas neste projeto.
export async function ensureOrderNumberColumn() {
  const db = getDB();
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT`);
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_idx ON orders (order_number) WHERE order_number IS NOT NULL`
  );
}

// Número "público" do pedido — curto, aleatório, não sequencial (não dá
// pra estimar quantas vendas a loja já teve só olhando o número, diferente
// do id interno usado em FK/URL). Tenta de novo em colisão (praticamente
// nunca acontece: 32^8 combinações), sem travar a criação do pedido por
// isso.
export async function generateUniqueOrderNumber(client: Pool | PoolClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomOrderNumber();
    const existing = await client.query(`SELECT 1 FROM orders WHERE order_number = $1`, [candidate]);
    if (existing.rows.length === 0) return candidate;
  }
  // Espaço de 32^8 praticamente não colide 5x seguidas — se chegou aqui,
  // algo mais grave está acontecendo; deixa estourar em vez de gerar um
  // número fraco/previsível como último recurso.
  throw new Error("ORDER_NUMBER_GENERATION_FAILED");
}

// Pedido criado antes dessa coluna existir não tem order_number — cai
// nisso só pra exibição, nunca é gravado.
export function displayOrderNumber(order: { order_number?: string | null; id: number }): string {
  return order.order_number || `LEGADO-${order.id}`;
}
