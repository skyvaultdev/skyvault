import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { vi } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

const { GET } = await import("./route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

function request(query: string) {
  return new Request(`https://example.com/api/products?${query}`);
}

describe("GET /api/products — busca paginada (Fase 5)", () => {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const productIds: number[] = [];

  beforeAll(async () => {
    const db = getDB();
    // 3 produtos batendo pelo NOME, 1 batendo só pela DESCRIÇÃO.
    for (let i = 0; i < 3; i++) {
      const res = await db.query(
        `INSERT INTO products (name, price, product_type, stock_type, stock_content, stock_count, is_unlimited, active)
         VALUES ($1, 10, 'digital', 'infinite', 'Entrega automática ativada', 10, false, true) RETURNING id`,
        [`[TESTE-${tag}] Produto Busca ${i}`]
      );
      productIds.push(res.rows[0].id);
    }
    const descOnly = await db.query(
      `INSERT INTO products (name, price, description, product_type, stock_type, stock_content, stock_count, is_unlimited, active)
       VALUES ($1, 10, $2, 'digital', 'infinite', 'Entrega automática ativada', 10, false, true) RETURNING id`,
      [`[TESTE-${tag}] Outro Nome Qualquer`, `menciona o termo-unico-${tag} só na descrição`]
    );
    productIds.push(descOnly.rows[0].id);
  });

  afterAll(async () => {
    const db = getDB();
    for (const id of productIds) {
      await db.query(`DELETE FROM products WHERE id = $1`, [id]).catch(() => {});
    }
  });

  it("devolve {items,total,page,pageSize} quando 'name' é passado (busca)", async () => {
    const res = await GET(request(`name=${encodeURIComponent(`Produto Busca`)}&page=1&pageSize=2`));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.total).toBeGreaterThanOrEqual(3);
    expect(json.data.items).toHaveLength(2); // pageSize=2
    expect(json.data.page).toBe(1);
    expect(json.data.pageSize).toBe(2);
  });

  it("pagina corretamente — página 2 traz o restante, sem repetir itens", async () => {
    const page1 = await GET(request(`name=${encodeURIComponent(`[TESTE-${tag}] Produto Busca`)}&page=1&pageSize=2`));
    const page1Json = await page1.json();
    const page2 = await GET(request(`name=${encodeURIComponent(`[TESTE-${tag}] Produto Busca`)}&page=2&pageSize=2`));
    const page2Json = await page2.json();

    expect(page1Json.data.total).toBe(3);
    expect(page1Json.data.items).toHaveLength(2);
    expect(page2Json.data.items).toHaveLength(1);

    const page1Ids = page1Json.data.items.map((p: { id: number }) => p.id);
    const page2Ids = page2Json.data.items.map((p: { id: number }) => p.id);
    expect(page1Ids.some((id: number) => page2Ids.includes(id))).toBe(false);
  });

  it("busca também na descrição, não só no nome", async () => {
    const res = await GET(request(`name=${encodeURIComponent(`termo-unico-${tag}`)}`));
    const json = await res.json();
    expect(json.data.total).toBe(1);
    expect(json.data.items[0].name).toBe(`[TESTE-${tag}] Outro Nome Qualquer`);
  });

  it("limita pageSize em 50 mesmo se um valor maior for pedido", async () => {
    const res = await GET(request(`name=${encodeURIComponent(`[TESTE-${tag}]`)}&pageSize=500`));
    const json = await res.json();
    expect(json.data.pageSize).toBe(50);
  });

  it("sem 'name', continua devolvendo um array puro (compatibilidade com quem lista tudo, ex: dropdowns do admin)", async () => {
    const res = await GET(request("withoutCategory=1"));
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
  });
});
