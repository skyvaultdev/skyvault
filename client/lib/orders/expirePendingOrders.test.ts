import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";

// cancelMercadoPagoPayment faria uma chamada de rede real pra API do
// Mercado Pago — mockado aqui (mesmo padrão de "route-handler-com-mocks"
// já usado em app/api/webhooks/mercadopago/route.test.ts, só que aplicado a
// uma função de lib em vez de uma rota) pra manter o teste determinístico
// e sem depender de credenciais reais configuradas em .env.local.
const cancelMercadoPagoPaymentMock = vi.fn();
vi.mock("@/lib/payments/mercadoPagoProvider", () => ({
  cancelMercadoPagoPayment: (id: string) => cancelMercadoPagoPaymentMock(id),
}));

const { expirePendingOrders } = await import("./expirePendingOrders");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

beforeEach(() => {
  cancelMercadoPagoPaymentMock.mockReset();
});

async function createTestUser(tag: string) {
  const db = getDB();
  const res = await db.query(
    `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`,
    [`teste-expireorders-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`, `Teste ${tag}`]
  );
  return res.rows[0].id as number;
}

async function createPendingOrder(userId: number, hoursAgo: number) {
  const db = getDB();
  const res = await db.query(
    `INSERT INTO orders (user_id, status, subtotal, total, created_at)
     VALUES ($1, 'pending_payment', 10, 10, NOW() - ($2 || ' hours')::interval) RETURNING id`,
    [userId, hoursAgo]
  );
  return Number(res.rows[0].id);
}

async function cleanupOrder(orderId: number) {
  const db = getDB();
  await db.query(`DELETE FROM payment_transactions WHERE order_id = $1`, [orderId]);
  await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
}

describe("expirePendingOrders", () => {
  let userId: number;

  beforeAll(async () => {
    userId = await createTestUser("expire");
  });

  afterAll(async () => {
    await getDB().query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  it("expira um pedido pending_payment mais velho que o limite configurado", async () => {
    const orderId = await createPendingOrder(userId, 30);
    try {
      const result = await expirePendingOrders(24);

      expect(result.expiredOrderIds).toContain(orderId);
      const row = await getDB().query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(row.rows[0].status).toBe("expired");
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it("não toca num pedido pending_payment ainda dentro do limite", async () => {
    const orderId = await createPendingOrder(userId, 1);
    try {
      const result = await expirePendingOrders(24);

      expect(result.expiredOrderIds).not.toContain(orderId);
      const row = await getDB().query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(row.rows[0].status).toBe("pending_payment");
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it("não expira (nem reverte) um pedido que já não está mais pending_payment", async () => {
    const orderId = await createPendingOrder(userId, 30);
    await getDB().query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [orderId]);
    try {
      const result = await expirePendingOrders(24);

      expect(result.expiredOrderIds).not.toContain(orderId);
      const row = await getDB().query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(row.rows[0].status).toBe("paid");
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it("tenta cancelar o Pix pendente no Mercado Pago e expira o pedido mesmo se o cancelamento falhar", async () => {
    const orderId = await createPendingOrder(userId, 30);
    await getDB().query(
      `INSERT INTO payment_transactions (order_id, provider, method, status, amount, provider_txid)
       VALUES ($1, 'mercadopago', 'pix', 'pending', 10, 'fake-txid-123')`,
      [orderId]
    );
    cancelMercadoPagoPaymentMock.mockRejectedValue(new Error("Mercado Pago não configurado."));

    try {
      const result = await expirePendingOrders(24);

      expect(cancelMercadoPagoPaymentMock).toHaveBeenCalledWith("fake-txid-123");
      expect(result.expiredOrderIds).toContain(orderId);
      expect(result.cancelFailures).toEqual([
        { orderId, providerTxid: "fake-txid-123", error: "Mercado Pago não configurado." },
      ]);

      const orderRow = await getDB().query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(orderRow.rows[0].status).toBe("expired");

      const txRow = await getDB().query(`SELECT status FROM payment_transactions WHERE order_id = $1`, [orderId]);
      expect(txRow.rows[0].status).toBe("expired");
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it("expira e marca a transação como expirada quando o cancelamento no Mercado Pago funciona", async () => {
    const orderId = await createPendingOrder(userId, 30);
    await getDB().query(
      `INSERT INTO payment_transactions (order_id, provider, method, status, amount, provider_txid)
       VALUES ($1, 'mercadopago', 'pix', 'pending', 10, 'fake-txid-456')`,
      [orderId]
    );
    cancelMercadoPagoPaymentMock.mockResolvedValue(undefined);

    try {
      const result = await expirePendingOrders(24);

      expect(result.cancelFailures).toHaveLength(0);
      expect(result.expiredOrderIds).toContain(orderId);

      const txRow = await getDB().query(`SELECT status FROM payment_transactions WHERE order_id = $1`, [orderId]);
      expect(txRow.rows[0].status).toBe("expired");
    } finally {
      await cleanupOrder(orderId);
    }
  });
});
