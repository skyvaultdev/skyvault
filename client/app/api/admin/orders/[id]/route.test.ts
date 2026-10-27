import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { signJWT } from "@/lib/jwt/init";

// Mesmo padrão dos outros testes de rota desta leva: integração contra o
// banco real, só next/headers simulado pra poder chamar o handler da rota
// fora do runtime de requisição do Next.
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "auth_token" && cookieValue ? { value: cookieValue } : undefined) }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

// Evita mandar e-mail de verdade — mesmo padrão já usado nos outros pontos
// que chamam confirmOrderPayment. Precisa resolver pra uma Promise: a rota
// agora chama isso sem await (.catch(...) fire-and-forget).
vi.mock("@/lib/mail/sendOrderDeliveryEmail", () => ({
  sendOrderDeliveryEmail: vi.fn().mockResolvedValue(undefined),
}));

const { PATCH } = await import("./route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

afterEach(() => {
  cookieValue = undefined;
});

function patchRequest(body: unknown) {
  return new Request("https://example.com/api/admin/orders/1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createTestUser(tag: string) {
  const db = getDB();
  const res = await db.query(
    `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`,
    [`teste-adminorders-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`, `Teste ${tag}`]
  );
  return res.rows[0].id as number;
}

describe("PATCH /api/admin/orders/[id] — marcar como pago manualmente", () => {
  let userId: number;
  let productId: number;
  let staffEmail: string;

  beforeAll(async () => {
    const db = getDB();
    userId = await createTestUser("manual-paid");
    staffEmail = `teste-staff-orders-manage-${Date.now()}@teste.com`;

    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_content, stock_count, is_unlimited, active)
       VALUES ($1, 20, 'digital', 'infinite', 'Entrega automática ativada', 10, false, true) RETURNING id`,
      ["[TESTE] Produto Admin Manual Paid"]
    );
    productId = productRes.rows[0].id;
  });

  afterAll(async () => {
    const db = getDB();
    await db.query(`DELETE FROM stock_movements WHERE product_id = $1`, [productId]).catch(() => {});
    await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  async function createPendingOrder() {
    const db = getDB();
    const orderRes = await db.query(
      `INSERT INTO orders (user_id, status, subtotal, total) VALUES ($1, 'pending_payment', 20, 20) RETURNING id`,
      [userId]
    );
    const orderId = Number(orderRes.rows[0].id);
    await db.query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, product_type, product_name) VALUES ($1, $2, 1, 20, 'digital', $3)`,
      [orderId, productId, "[TESTE] Produto Admin Manual Paid"]
    );
    return orderId;
  }

  async function cleanupOrder(orderId: number) {
    const db = getDB();
    await db.query(`DELETE FROM payment_transactions WHERE order_id = $1`, [orderId]);
    await db.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
    await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
  }

  it("confirma o pagamento de verdade (entrega + baixa de estoque) em vez de só trocar o texto do status", async () => {
    const orderId = await createPendingOrder();
    try {
      cookieValue = await signJWT({ email: staffEmail, sid: 1, permissions: ["orders.manage"] });
      const res = await PATCH(
        patchRequest({ action: "set_order_status", status: "paid", notifyEmail: false }),
        paramsFor(String(orderId))
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.orderStatus).toBe("delivered");

      const order = await getDB().query(`SELECT status, paid_at FROM orders WHERE id = $1`, [orderId]);
      expect(order.rows[0].status).toBe("delivered");
      expect(order.rows[0].paid_at).not.toBeNull();

      const item = await getDB().query(`SELECT delivered_at FROM order_items WHERE order_id = $1`, [orderId]);
      expect(item.rows[0].delivered_at).not.toBeNull();

      const stock = await getDB().query(`SELECT stock_count FROM products WHERE id = $1`, [productId]);
      expect(Number(stock.rows[0].stock_count)).toBe(9); // decrementou 1 unidade
    } finally {
      await cleanupOrder(orderId);
      await getDB().query(`UPDATE products SET stock_count = 10 WHERE id = $1`, [productId]);
    }
  });

  it("não deixa marcar como pago sem a permissão orders.manage", async () => {
    const orderId = await createPendingOrder();
    try {
      cookieValue = await signJWT({ email: "teste-sem-permissao-orders@teste.com", sid: 1, permissions: [] });
      const res = await PATCH(
        patchRequest({ action: "set_order_status", status: "paid", notifyEmail: false }),
        paramsFor(String(orderId))
      );
      expect(res.status).not.toBe(200);

      const order = await getDB().query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(order.rows[0].status).toBe("pending_payment");
    } finally {
      await cleanupOrder(orderId);
    }
  });
});
