import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { confirmOrderPayment } from "@/lib/payments/confirmOrderPayment";
import { ensureStockMovementsTable } from "@/lib/stock/stockMovements";

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
  // orders.id é bigint — o driver pg devolve como string, não number.
  const orderId = Number(orderRes.rows[0].id);
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

describe("confirmOrderPayment — tipos de entrega digital: arquivo e chave", () => {
  let userId: number;

  beforeAll(async () => {
    userId = await createTestUser(getDB(), "delivery-types");
  });

  afterAll(async () => {
    const db = getDB();
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  it("entrega um produto tipo arquivo com o link de download correto", async () => {
    const db = getDB();
    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_content, stock_count, is_unlimited, active)
       VALUES ($1, $2, 'digital', 'file', $3, $4, false, true) RETURNING id`,
      ["[TESTE] Produto Arquivo", 39.9, "manual-de-instrucoes.pdf", 5]
    );
    const productId = productRes.rows[0].id;
    let orderId: number | undefined;
    try {
      orderId = await createOrderWithItem(db, userId, productId, 1, "digital", "[TESTE] Produto Arquivo");

      const result = await confirmOrderPayment(orderId);

      expect(result.order.status).toBe("delivered");
      expect(result.deliveredItems).toHaveLength(1);
      expect(result.deliveredItems[0]).toMatchObject({
        productName: "[TESTE] Produto Arquivo",
        type: "file",
        content: "/api/files/products/uploads/manual-de-instrucoes.pdf",
      });

      const stockRow = await db.query(`SELECT stock_count FROM products WHERE id = $1`, [productId]);
      expect(stockRow.rows[0].stock_count).toBe(4); // decrementou 1 normalmente
    } finally {
      if (orderId) await cleanupOrder(db, orderId);
      await db.query(`DELETE FROM stock_movements WHERE product_id = $1`, [productId]).catch(() => {});
      await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
  });

  it("entrega um produto tipo chave reservando uma linha de stock_keys e evita entregar a mesma chave duas vezes", async () => {
    const db = getDB();
    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_count, is_unlimited, active)
       VALUES ($1, $2, 'digital', 'key', $3, false, true) RETURNING id`,
      ["[TESTE] Produto Chave", 59.9, 2]
    );
    const productId = productRes.rows[0].id;
    let orderId: number | undefined;
    try {
      const keyRes = await db.query(
        `INSERT INTO stock_keys (product_id, key_content, is_sold) VALUES ($1, $2, false) RETURNING id`,
        [productId, "XXXX-YYYY-ZZZZ"]
      );
      const keyId = keyRes.rows[0].id;

      orderId = await createOrderWithItem(db, userId, productId, 1, "digital", "[TESTE] Produto Chave");

      const result = await confirmOrderPayment(orderId);

      expect(result.order.status).toBe("delivered");
      expect(result.deliveredItems).toHaveLength(1);
      expect(result.deliveredItems[0]).toMatchObject({ productName: "[TESTE] Produto Chave", type: "key", content: "XXXX-YYYY-ZZZZ" });
      expect(result.stockShortages).toHaveLength(0);

      const keyRow = await db.query(`SELECT is_sold, order_id FROM stock_keys WHERE id = $1`, [keyId]);
      expect(keyRow.rows[0].is_sold).toBe(true);
      expect(keyRow.rows[0].order_id).toBe(orderId);

      const stockRow = await db.query(`SELECT stock_count FROM products WHERE id = $1`, [productId]);
      expect(stockRow.rows[0].stock_count).toBe(1); // decrementou pela chave realmente entregue

      // Idempotência: chamar de novo não entrega a MESMA chave outra vez nem
      // decrementa o estoque de novo.
      const second = await confirmOrderPayment(orderId);
      expect(second.alreadyProcessed).toBe(true);
      const stockRowAfter = await db.query(`SELECT stock_count FROM products WHERE id = $1`, [productId]);
      expect(stockRowAfter.rows[0].stock_count).toBe(1);
    } finally {
      await db.query(`DELETE FROM stock_keys WHERE product_id = $1`, [productId]);
      if (orderId) await cleanupOrder(db, orderId);
      await db.query(`DELETE FROM stock_movements WHERE product_id = $1`, [productId]).catch(() => {});
      await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
  });

  it("não marca o pedido como 'delivered' quando não há NENHUMA chave em estoque (0 entregues)", async () => {
    // Reproduz exatamente o caso visto em produção: produto tipo chave sem
    // nenhuma linha em stock_keys. Antes desse fix, confirmOrderPayment
    // marcava orders.status = 'delivered' (e order_items.delivered_at)
    // mesmo com ZERO itens entregues — o cliente via "pedido entregue" de
    // mãos vazias, tendo pago de verdade.
    const db = getDB();
    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_count, is_unlimited, active)
       VALUES ($1, $2, 'digital', 'key', $3, false, true) RETURNING id`,
      ["[TESTE] Produto Sem Chave Nenhuma", 59.9, 5]
    );
    const productId = productRes.rows[0].id;
    let orderId: number | undefined;
    let orderItemId: number | undefined;
    try {
      // Nenhuma linha em stock_keys pra esse produto.
      orderId = await createOrderWithItem(db, userId, productId, 1, "digital", "[TESTE] Produto Sem Chave Nenhuma");
      orderItemId = (await db.query(`SELECT id FROM order_items WHERE order_id = $1`, [orderId])).rows[0].id;

      const result = await confirmOrderPayment(orderId);

      expect(result.deliveredItems).toHaveLength(0);
      expect(result.stockShortages).toHaveLength(1);
      expect(result.stockShortages[0]).toMatchObject({ requested: 1, delivered: 0, shortage: 1, blocksDelivery: true });
      // O pedido NÃO pode virar "delivered" com zero itens entregues —
      // fica "paid", igual um físico ainda não despachado, até o staff
      // resolver manualmente.
      expect(result.order.status).toBe("paid");

      const orderRow = await db.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(orderRow.rows[0].status).toBe("paid");

      const itemRow = await db.query(`SELECT delivered_at FROM order_items WHERE id = $1`, [orderItemId]);
      expect(itemRow.rows[0].delivered_at).toBeNull();
    } finally {
      if (orderId) await cleanupOrder(db, orderId);
      await db.query(`DELETE FROM stock_movements WHERE product_id = $1`, [productId]).catch(() => {});
      await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
  });

  it("registra falta de chaves como shortage em vez de entregar menos do que o pedido sem avisar", async () => {
    const db = getDB();
    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_count, is_unlimited, active)
       VALUES ($1, $2, 'digital', 'key', $3, false, true) RETURNING id`,
      ["[TESTE] Produto Chave Escassa", 59.9, 5]
    );
    const productId = productRes.rows[0].id;
    let orderId: number | undefined;
    try {
      // Só 1 chave em estoque, mas o pedido é de 3.
      await db.query(`INSERT INTO stock_keys (product_id, key_content, is_sold) VALUES ($1, $2, false)`, [productId, "SOLO-KEY-0001"]);

      orderId = await createOrderWithItem(db, userId, productId, 3, "digital", "[TESTE] Produto Chave Escassa");

      const result = await confirmOrderPayment(orderId);

      expect(result.deliveredItems).toHaveLength(1); // só a 1 chave que existia
      expect(result.stockShortages).toHaveLength(1);
      expect(result.stockShortages[0]).toMatchObject({ requested: 3, delivered: 1, shortage: 2 });

      const stockRow = await db.query(`SELECT stock_count FROM products WHERE id = $1`, [productId]);
      expect(stockRow.rows[0].stock_count).toBe(4); // decrementou só 1 (a chave que existia), não 3
    } finally {
      await db.query(`DELETE FROM stock_keys WHERE product_id = $1`, [productId]);
      if (orderId) await cleanupOrder(db, orderId);
      await db.query(`DELETE FROM stock_movements WHERE product_id = $1`, [productId]).catch(() => {});
      await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
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

describe("confirmOrderPayment — regressão: migração não aplicada", () => {
  let userId: number;
  let productId: number;

  beforeAll(async () => {
    const db = getDB();
    userId = await createTestUser(db, "migration-regression");

    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_content, stock_count, is_unlimited, active)
       VALUES ($1, $2, 'digital', 'infinite', $3, $4, false, true)
       RETURNING id`,
      ["[TESTE] Produto Regressão Migração", 29.9, "Entrega automática ativada", 5]
    );
    productId = productRes.rows[0].id;
  });

  afterAll(async () => {
    const db = getDB();
    await db.query(`DELETE FROM stock_movements WHERE product_id = $1`, [productId]).catch(() => {});
    await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  // Reproduz o incidente do commitV12 (stock_movements não existia no
  // banco → INSERT de logStockMovement, dentro da MESMA transação de
  // confirmOrderPayment, lançava erro → rollback de tudo com o cliente já
  // cobrado) SEM tocar na tabela real — este teste roda contra o banco de
  // .env.local, o mesmo que o `npm run dev` usa, então derrubar a tabela
  // de verdade (versão anterior deste teste) apagava permanentemente todo
  // o histórico de estoque de produção toda vez que alguém rodava
  // `npm test`. Em vez disso, verifica só a propriedade que realmente
  // importa: ensureStockMovementsTable() é idempotente (chamar de novo com
  // a tabela já existindo, no meio de outra operação, nunca lança erro) —
  // é exatamente essa chamada, antes de toda transação de
  // confirmOrderPayment, que garante a tabela existir na primeira vez que
  // roda num banco novo/restaurado sem essa migração aplicada.
  it("ensureStockMovementsTable() é idempotente e confirmOrderPayment funciona normalmente com ela já existindo", async () => {
    const db = getDB();
    await ensureStockMovementsTable();
    await ensureStockMovementsTable();

    const tableExists = await db.query(`SELECT to_regclass('public.stock_movements') AS reg`);
    expect(tableExists.rows[0].reg).toBe("stock_movements");

    const orderId = await createOrderWithItem(db, userId, productId, 1, "digital", "[TESTE] Produto Regressão Migração");

    const result = await confirmOrderPayment(orderId);

    expect(result.alreadyProcessed).toBe(false);
    expect(result.order.status).toBe("delivered");
    expect(result.deliveredItems).toHaveLength(1);

    const orderRow = await db.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
    expect(orderRow.rows[0].status).toBe("delivered");

    await cleanupOrder(db, orderId);
  });
});
