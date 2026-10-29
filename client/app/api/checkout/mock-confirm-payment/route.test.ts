import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";

// vi.hoisted roda ANTES de qualquer import estático deste arquivo (mesmo
// import {...} sendo escrito antes na fonte, o compilador do Vitest
// hoisteia imports pro topo) — sem isso, config/configuration.ts (lido
// transitivamente por lib/database/init.ts já no import abaixo) travava
// com PAYMENT_PROVIDER ainda indefinido, e a rota sempre devolvia 404.
vi.hoisted(() => {
  process.env.PAYMENT_PROVIDER = "mock";
});

import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { signJWT } from "@/lib/jwt/init";

// Teste de integração contra o banco real de .env.local (mesmo padrão de
// lib/payments/confirmOrderPayment.test.ts) — só next/headers é simulado
// (cookies()/headers() dependem do runtime de requisição do Next, que não
// existe fora de um server de verdade), pra poder chamar o handler da rota
// diretamente com um "cookie jar" controlável pelo teste.
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "auth_token" && cookieValue ? { value: cookieValue } : undefined) }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

// Evita mandar e-mail de verdade (e travar o teste esperando o SMTP real
// de .env.local) — mesmo padrão já usado em
// app/api/webhooks/mercadopago/route.test.ts.
// Precisa resolver pra uma Promise — a rota agora chama isso sem await
// (.catch(...) fire-and-forget), e `.catch` em `undefined` quebraria o
// handler na hora.
vi.mock("@/lib/mail/sendOrderDeliveryEmail", () => ({
  sendOrderDeliveryEmail: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import("./route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

afterEach(() => {
  cookieValue = undefined;
});

function request(body: unknown) {
  return new Request("https://example.com/api/checkout/mock-confirm-payment", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function createTestUser(tag: string) {
  const db = getDB();
  const email = `teste-mockconfirm-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;
  const res = await db.query(`INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`, [email, `Teste ${tag}`]);
  return { userId: res.rows[0].id as number, email };
}

async function createOrder(userId: number, productId: number, productName: string) {
  const db = getDB();
  const orderRes = await db.query(
    `INSERT INTO orders (user_id, status, subtotal, total) VALUES ($1, 'pending_payment', 10, 10) RETURNING id`,
    [userId]
  );
  const orderId = Number(orderRes.rows[0].id);
  await db.query(
    `INSERT INTO order_items (order_id, product_id, quantity, unit_price, product_type, product_name) VALUES ($1, $2, 1, 10, 'digital', $3)`,
    [orderId, productId, productName]
  );
  return orderId;
}

async function cleanupOrder(orderId: number) {
  const db = getDB();
  await db.query(`DELETE FROM payment_transactions WHERE order_id = $1`, [orderId]);
  await db.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
  await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
}

describe("POST /api/checkout/mock-confirm-payment", () => {
  let userId: number;
  let email: string;
  let productId: number;

  beforeAll(async () => {
    const db = getDB();
    ({ userId, email } = await createTestUser("guard"));

    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_content, stock_count, is_unlimited, active)
       VALUES ($1, $2, 'digital', 'infinite', $3, $4, false, true) RETURNING id`,
      ["[TESTE] Produto Mock Confirm", 10, "Entrega automática ativada", 10]
    );
    productId = productRes.rows[0].id;
  });

  afterAll(async () => {
    const db = getDB();
    await db.query(`DELETE FROM stock_movements WHERE product_id = $1`, [productId]).catch(() => {});
    await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  it("recusa um pedido que ainda não tem NENHUMA payment_transactions — é exatamente o bug de 'compra sem pagar'", async () => {
    const orderId = await createOrder(userId, productId, "[TESTE] Produto Mock Confirm");
    try {
      cookieValue = await signJWT({ email, sid: 1 });
      const res = await POST(request({ orderId }));
      expect(res.status).toBe(404);

      const order = await getDB().query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(order.rows[0].status).toBe("pending_payment"); // não foi "confirmado" de graça
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it("recusa um pedido cuja transação mais recente é de verdade (provider='mercadopago')", async () => {
    const orderId = await createOrder(userId, productId, "[TESTE] Produto Mock Confirm");
    try {
      await getDB().query(
        `INSERT INTO payment_transactions (order_id, provider, method, status, amount) VALUES ($1, 'mercadopago', 'pix', 'pending', 10)`,
        [orderId]
      );
      cookieValue = await signJWT({ email, sid: 1 });
      const res = await POST(request({ orderId }));
      expect(res.status).toBe(404);

      const order = await getDB().query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(order.rows[0].status).toBe("pending_payment");
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it("confirma e entrega normalmente quando o pedido tem uma payment_transactions com provider='mock'", async () => {
    const orderId = await createOrder(userId, productId, "[TESTE] Produto Mock Confirm");
    try {
      await getDB().query(
        `INSERT INTO payment_transactions (order_id, provider, method, status, amount) VALUES ($1, 'mock', 'pix', 'pending', 10)`,
        [orderId]
      );
      cookieValue = await signJWT({ email, sid: 1 });
      const res = await POST(request({ orderId }));
      expect(res.status).toBe(200);

      const order = await getDB().query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(order.rows[0].status).toBe("delivered");
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it("não deixa um cliente confirmar o pedido de outro cliente, mesmo com provider='mock'", async () => {
    const orderId = await createOrder(userId, productId, "[TESTE] Produto Mock Confirm");
    try {
      await getDB().query(
        `INSERT INTO payment_transactions (order_id, provider, method, status, amount) VALUES ($1, 'mock', 'pix', 'pending', 10)`,
        [orderId]
      );
      const { email: otherEmail, userId: otherUserId } = await createTestUser("intruder");
      try {
        cookieValue = await signJWT({ email: otherEmail, sid: 1 });
        const res = await POST(request({ orderId }));
        expect(res.status).toBe(404);
      } finally {
        await getDB().query(`DELETE FROM users WHERE id = $1`, [otherUserId]);
      }
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it("a rota nem existe em produção (404), mesmo com PAYMENT_PROVIDER=mock e payment_transactions mock válida", async () => {
    const orderId = await createOrder(userId, productId, "[TESTE] Produto Mock Confirm");
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      await getDB().query(
        `INSERT INTO payment_transactions (order_id, provider, method, status, amount) VALUES ($1, 'mock', 'pix', 'pending', 10)`,
        [orderId]
      );
      cookieValue = await signJWT({ email, sid: 1 });
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      const res = await POST(request({ orderId }));
      expect(res.status).toBe(404);

      const order = await getDB().query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(order.rows[0].status).toBe("pending_payment");
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
      await cleanupOrder(orderId);
    }
  });
});
