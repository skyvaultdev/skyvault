import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { signJWT } from "@/lib/jwt/init";

// Mesmo padrão dos outros testes de rota desta leva: integração contra o
// banco real, só next/headers simulado.
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "auth_token" && cookieValue ? { value: cookieValue } : undefined) }),
  headers: async () => new Headers({ host: "localhost:3000" }),
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

// termsAccepted: true por padrão — testes que especificamente verificam
// a rejeição sem aceite passam `{ termsAccepted: false }` explicitamente.
function request(body: Record<string, unknown> = {}) {
  return new Request("https://example.com/api/checkout/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ termsAccepted: true, ...body }),
  });
}

async function createTestUser(tag: string) {
  const db = getDB();
  const email = `teste-create-order-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;
  const res = await db.query(`INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`, [email, `Teste ${tag}`]);
  return { userId: res.rows[0].id as number, email };
}

describe("POST /api/checkout/create-order — produto desativado depois de ir pro carrinho", () => {
  let userId: number;
  let email: string;
  let productId: number;

  beforeAll(async () => {
    const db = getDB();
    ({ userId, email } = await createTestUser("product-unavailable"));

    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_content, stock_count, is_unlimited, active)
       VALUES ($1, 10, 'digital', 'infinite', 'Entrega automática ativada', 10, false, true) RETURNING id`,
      ["[TESTE] Produto Inativo Checkout"]
    );
    productId = productRes.rows[0].id;

    // Carrinho montado direto no banco (não pela rota PUT, que já bloqueia
    // isso na entrada) — reproduz o cenário real: o produto estava ativo
    // quando foi pro carrinho e foi desativado depois, antes do checkout.
    await db.query(
      `INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, 1)`,
      [userId, productId]
    );
    await db.query(`UPDATE products SET active = false WHERE id = $1`, [productId]);
  });

  afterAll(async () => {
    const db = getDB();
    await db.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  afterEach(async () => {
    // Garante que nenhum pedido foi criado por engano em nenhum teste.
    await getDB().query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)`, [userId]);
    await getDB().query(`DELETE FROM orders WHERE user_id = $1`, [userId]);
  });

  it("recusa com PRODUCT_UNAVAILABLE:<nome> e não cria pedido nem mexe no carrinho", async () => {
    cookieValue = await signJWT({ email, sid: 1 });
    const res = await POST(request());

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("PRODUCT_UNAVAILABLE:[TESTE] Produto Inativo Checkout");

    const orders = await getDB().query(`SELECT 1 FROM orders WHERE user_id = $1`, [userId]);
    expect(orders.rows).toHaveLength(0);

    const cart = await getDB().query(`SELECT 1 FROM cart_items WHERE user_id = $1`, [userId]);
    expect(cart.rows).toHaveLength(1); // carrinho não foi esvaziado numa tentativa que falhou
  });
});

describe("POST /api/checkout/create-order — cupom: limite por cliente e used_count só no pagamento", () => {
  let userId: number;
  let email: string;
  let productId: number;
  let couponId: number;
  let couponCode: string;

  beforeAll(async () => {
    const db = getDB();
    ({ userId, email } = await createTestUser("coupon-limit"));

    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_content, stock_count, is_unlimited, active)
       VALUES ($1, 50, 'digital', 'infinite', 'Entrega automática ativada', 10, false, true) RETURNING id`,
      ["[TESTE] Produto Cupom CreateOrder"]
    );
    productId = productRes.rows[0].id;

    couponCode = `TESTE-CREATEORDER-${Date.now()}`;
    const couponRes = await db.query(
      `INSERT INTO coupons (code, percent_off, usage_limit, used_count, per_user_limit, active)
       VALUES ($1, 10, 0, 0, 1, true) RETURNING id`,
      [couponCode]
    );
    couponId = couponRes.rows[0].id;
  });

  afterAll(async () => {
    const db = getDB();
    await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    await db.query(`DELETE FROM coupons WHERE id = $1`, [couponId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  afterEach(async () => {
    const db = getDB();
    await db.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)`, [userId]);
    await db.query(`DELETE FROM orders WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);
  });

  it("aplica o cupom na criação sem incrementar used_count — só confirmOrderPayment incrementa (ver item 1 do fix)", async () => {
    const db = getDB();
    await db.query(`INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, 1)`, [userId, productId]);
    cookieValue = await signJWT({ email, sid: 1 });

    const res = await POST(request({ couponCode }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.appliedCoupon).toBe(couponCode);

    const coupon = await db.query(`SELECT used_count FROM coupons WHERE id = $1`, [couponId]);
    expect(coupon.rows[0].used_count).toBe(0);
  });

  it("bloqueia um novo pedido com o mesmo cupom quando o cliente já tem um pedido PAGO usando ele (per_user_limit=1)", async () => {
    const db = getDB();
    await db.query(
      `INSERT INTO orders (user_id, status, subtotal, total, coupon_id) VALUES ($1, 'paid', 50, 45, $2)`,
      [userId, couponId]
    );
    await db.query(`INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, 1)`, [userId, productId]);
    cookieValue = await signJWT({ email, sid: 1 });

    const res = await POST(request({ couponCode }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("COUPON_USER_LIMIT_REACHED");
  });

  it("com o cliente já no limite, N requisições CONCORRENTES pro mesmo cupom são todas recusadas (advisory lock fecha a corrida)", async () => {
    const db = getDB();
    await db.query(
      `INSERT INTO orders (user_id, status, subtotal, total, coupon_id) VALUES ($1, 'paid', 50, 45, $2)`,
      [userId, couponId]
    );
    cookieValue = await signJWT({ email, sid: 1 });
    await db.query(`INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, 1)`, [userId, productId]);

    const CONCURRENT = 5;
    // Todas as N chamadas disparadas ao mesmo tempo, não em sequência —
    // é exatamente o cenário do item 5 do plano: duas (ou mais) abas/scripts
    // tentando criar pedido com o mesmo cupom ao mesmo tempo.
    const responses = await Promise.all(Array.from({ length: CONCURRENT }, () => POST(request({ couponCode }))));
    const statuses = responses.map((r) => r.status);

    expect(statuses.every((s) => s === 400)).toBe(true);
  });

  it("não conta pedido pending_payment/cancelado contra o limite por cliente", async () => {
    const db = getDB();
    await db.query(
      `INSERT INTO orders (user_id, status, subtotal, total, coupon_id) VALUES ($1, 'cancelled', 50, 45, $2)`,
      [userId, couponId]
    );
    await db.query(`INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, 1)`, [userId, productId]);
    cookieValue = await signJWT({ email, sid: 1 });

    const res = await POST(request({ couponCode }));
    expect(res.status).toBe(201);
  });
});

describe("POST /api/checkout/create-order — aceite dos termos obrigatório", () => {
  let userId: number;
  let email: string;
  let productId: number;

  beforeAll(async () => {
    const db = getDB();
    ({ userId, email } = await createTestUser("terms-required"));

    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_content, stock_count, is_unlimited, active)
       VALUES ($1, 10, 'digital', 'infinite', 'Entrega automática ativada', 10, false, true) RETURNING id`,
      ["[TESTE] Produto Aceite Termos"]
    );
    productId = productRes.rows[0].id;
  });

  afterAll(async () => {
    const db = getDB();
    await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  afterEach(async () => {
    const db = getDB();
    await db.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)`, [userId]);
    await db.query(`DELETE FROM orders WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);
  });

  it("recusa criar o pedido sem termsAccepted: true", async () => {
    const db = getDB();
    await db.query(`INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, 1)`, [userId, productId]);
    cookieValue = await signJWT({ email, sid: 1 });

    const res = await POST(request({ termsAccepted: false }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("TERMS_NOT_ACCEPTED");

    const orders = await db.query(`SELECT 1 FROM orders WHERE user_id = $1`, [userId]);
    expect(orders.rows).toHaveLength(0);
  });

  it("cria o pedido e grava terms_accepted_at quando termsAccepted: true", async () => {
    const db = getDB();
    await db.query(`INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, 1)`, [userId, productId]);
    cookieValue = await signJWT({ email, sid: 1 });

    const res = await POST(request());
    expect(res.status).toBe(201);
    const json = await res.json();

    const order = await db.query(`SELECT terms_accepted_at FROM orders WHERE id = $1`, [json.data.orderId]);
    expect(order.rows[0].terms_accepted_at).not.toBeNull();
  });
});
