import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { confirmOrderPayment } from "@/lib/payments/confirmOrderPayment";

// Teste de integração de verdade contra o banco configurado em .env.local
// (o mesmo que o `npm run dev` usa) — confirmOrderPayment faz SQL real
// demais (locks FOR UPDATE, transação, várias tabelas) pra valer a pena
// mockar o driver do Postgres. Cria e limpa suas próprias linhas de teste,
// nunca toca em dados que já existiam.
beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

async function createTestUser(db: ReturnType<typeof getDB>, tag: string) {
  const res = await db.query(
    `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`,
    [`teste-confirmpayment-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`, `Teste ${tag}`]
  );
  return res.rows[0].id as number;
}

async function createOrderWithItem(
  db: ReturnType<typeof getDB>,
  userId: number,
  productId: number,
  quantity: number,
  productType: "digital" | "physical",
  productName: string
) {
  const orderRes = await db.query(
    `INSERT INTO orders (user_id, status, subtotal, total) VALUES ($1, 'pending_payment', $2, $2) RETURNING id`,
    [userId, 10 * quantity]
  );
  const orderId = orderRes.rows[0].id as number;
  await db.query(
    `INSERT INTO order_items (order_id, product_id, quantity, unit_price, product_type, product_name)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, productId, quantity, 10, productType, productName]
  );
  return orderId;
}

async function cleanupOrder(db: ReturnType<typeof getDB>, orderId: number) {
  await db.query(`DELETE FROM shipment_events WHERE shipment_id IN (SELECT id FROM shipments WHERE order_id = $1)`, [orderId]);
  await db.query(`DELETE FROM shipments WHERE order_id = $1`, [orderId]);
  await db.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
  await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
}

describe("confirmOrderPayment — entrega do produto", () => {
  let userId: number;
  let productId: number;
  let orderId: number;

  beforeAll(async () => {
    const db = getDB();
    userId = await createTestUser(db, "delivery");

    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_content, stock_count, is_unlimited, active)
       VALUES ($1, $2, 'digital', 'infinite', $3, $4, false, true)
       RETURNING id`,
      ["[TESTE] Produto Digital Infinito", 49.9, "Entrega automática ativada", 10]
    );
    productId = productRes.rows[0].id;

    orderId = await createOrderWithItem(db, userId, productId, 2, "digital", "[TESTE] Produto Digital Infinito");
  });

  afterAll(async () => {
    const db = getDB();
    await cleanupOrder(db, orderId);
    await db.query(`DELETE FROM stock_movements WHERE product_id = $1`, [productId]).catch(() => {});
    await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  it("entrega o produto e marca o pedido como entregue quando o pagamento é confirmado", async () => {
    const result = await confirmOrderPayment(orderId);

    expect(result.alreadyProcessed).toBe(false);
    expect(result.order.status).toBe("delivered");
    expect(result.customerEmail).toMatch(/teste-confirmpayment-/);
    expect(result.deliveredItems).toHaveLength(1);
    expect(result.deliveredItems[0]).toMatchObject({
      productName: "[TESTE] Produto Digital Infinito",
      type: "infinite",
    });
    expect(result.stockShortages).toHaveLength(0);

    const db = getDB();
    const orderRow = await db.query(`SELECT status, paid_at FROM orders WHERE id = $1`, [orderId]);
    expect(orderRow.rows[0].status).toBe("delivered");
    expect(orderRow.rows[0].paid_at).not.toBeNull();
  });

  it("não entrega de novo nem baixa estoque duas vezes se for chamado outra vez pro mesmo pedido (idempotente)", async () => {
    const db = getDB();
    const stockBefore = await db.query(`SELECT stock_count FROM products WHERE id = $1`, [productId]);

    const result = await confirmOrderPayment(orderId);

    expect(result.alreadyProcessed).toBe(true);
    expect(result.deliveredItems).toHaveLength(0);

    const stockAfter = await db.query(`SELECT stock_count FROM products WHERE id = $1`, [productId]);
    expect(stockAfter.rows[0].stock_count).toBe(stockBefore.rows[0].stock_count);
  });
});

describe("confirmOrderPayment — redução de estoque (Fase 3)", () => {
  let userId: number;
  let productId: number;

  beforeAll(async () => {
    const db = getDB();
    userId = await createTestUser(db, "stock");

    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_count, is_unlimited, active)
       VALUES ($1, $2, 'physical', $3, false, true)
       RETURNING id`,
      ["[TESTE] Produto Físico Limitado", 10, 5]
    );
    productId = productRes.rows[0].id;
  });

  afterAll(async () => {
    const db = getDB();
    await db.query(`DELETE FROM stock_movements WHERE product_id = $1`, [productId]).catch(() => {});
    await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  it("decrementa exatamente a quantidade comprada quando há estoque suficiente", async () => {
    const db = getDB();
    const orderId = await createOrderWithItem(db, userId, productId, 3, "physical", "[TESTE] Produto Físico Limitado");

    const result = await confirmOrderPayment(orderId);

    expect(result.stockShortages).toHaveLength(0);
    const stockRow = await db.query(`SELECT stock_count FROM products WHERE id = $1`, [productId]);
    expect(stockRow.rows[0].stock_count).toBe(2); // 5 - 3

    await cleanupOrder(db, orderId);
  });

  it("detecta e registra estoque insuficiente em vez de vender silenciosamente além do disponível", async () => {
    const db = getDB();
    // Só sobraram 2 unidades (do teste anterior) — pede 10.
    const orderId = await createOrderWithItem(db, userId, productId, 10, "physical", "[TESTE] Produto Físico Limitado");

    const result = await confirmOrderPayment(orderId);

    expect(result.stockShortages).toHaveLength(1);
    expect(result.stockShortages[0]).toMatchObject({
      productName: "[TESTE] Produto Físico Limitado",
      requested: 10,
      delivered: 2,
      shortage: 8,
    });

    const stockRow = await db.query(`SELECT stock_count FROM products WHERE id = $1`, [productId]);
    expect(stockRow.rows[0].stock_count).toBe(0); // nunca fica negativo

    const movementRow = await db.query(
      `SELECT change, note FROM stock_movements WHERE product_id = $1 AND order_id = $2`,
      [productId, orderId]
    );
    expect(movementRow.rows[0].change).toBe(-2); // decrementa só o que existia de verdade
    expect(movementRow.rows[0].note).toMatch(/insuficiente/i);

    await cleanupOrder(db, orderId);
  });

  it("nunca deixa o estoque ficar negativo quando dois pedidos concorrentes disputam a última unidade", async () => {
    const db = getDB();

    const raceProductRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_count, is_unlimited, active)
       VALUES ($1, $2, 'physical', 1, false, true) RETURNING id`,
      ["[TESTE] Produto Concorrência", 10]
    );
    const raceProductId = raceProductRes.rows[0].id;

    const orderA = await createOrderWithItem(db, userId, raceProductId, 1, "physical", "[TESTE] Produto Concorrência");
    const orderB = await createOrderWithItem(db, userId, raceProductId, 1, "physical", "[TESTE] Produto Concorrência");

    // FOR UPDATE serializa as duas transações na mesma linha de produto —
    // uma delas ganha a última unidade, a outra deve detectar falta em vez
    // de também decrementar (o que deixaria stock_count negativo).
    const [resultA, resultB] = await Promise.all([
      confirmOrderPayment(orderA),
      confirmOrderPayment(orderB),
    ]);

    const stockRow = await db.query(`SELECT stock_count FROM products WHERE id = $1`, [raceProductId]);
    expect(stockRow.rows[0].stock_count).toBe(0);

    const shortages = [resultA, resultB].filter((r) => r.stockShortages.length > 0);
    const fullyDelivered = [resultA, resultB].filter((r) => r.stockShortages.length === 0);
    expect(shortages).toHaveLength(1);
    expect(fullyDelivered).toHaveLength(1);
    expect(shortages[0].stockShortages[0]).toMatchObject({ requested: 1, delivered: 0, shortage: 1 });

    await cleanupOrder(db, orderA);
    await cleanupOrder(db, orderB);
    await db.query(`DELETE FROM stock_movements WHERE product_id = $1`, [raceProductId]).catch(() => {});
    await db.query(`DELETE FROM products WHERE id = $1`, [raceProductId]);
  });
});
