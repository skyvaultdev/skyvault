import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { signJWT } from "@/lib/jwt/init";

// Mesmo padrão de app/api/checkout/mock-confirm-payment/route.test.ts:
// integração contra o banco real, só next/headers simulado pra poder
// chamar o handler da rota fora do runtime de requisição do Next.
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "auth_token" && cookieValue ? { value: cookieValue } : undefined) }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

const { GET } = await import("./route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

afterEach(() => {
  cookieValue = undefined;
});

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/products/[id] — não vaza o conteúdo digital", () => {
  let productId: number;
  let slug: string;

  beforeAll(async () => {
    const db = getDB();
    slug = `teste-produto-publico-${Date.now()}`;
    const res = await db.query(
      `INSERT INTO products (name, slug, price, product_type, stock_type, stock_content, stock_count, is_unlimited, active)
       VALUES ($1, $2, 29.9, 'digital', 'key', $3, 3, false, true) RETURNING id`,
      ["[TESTE] Produto Público", slug, "SEGREDO-QUE-NAO-PODE-VAZAR"]
    );
    productId = res.rows[0].id;
  });

  afterAll(async () => {
    await getDB().query(`DELETE FROM products WHERE id = $1`, [productId]);
  });

  it("devolve o produto pelo slug (acesso público/anônimo) sem stock_content nem stock_type nem store_id", async () => {
    const res = await GET(new Request("https://example.com/api/products/" + slug), paramsFor(slug));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.data.name).toBe("[TESTE] Produto Público");
    expect(JSON.stringify(json.data)).not.toContain("SEGREDO-QUE-NAO-PODE-VAZAR");
    expect(json.data).not.toHaveProperty("stock_content");
    expect(json.data).not.toHaveProperty("stock_type");
    expect(json.data).not.toHaveProperty("store_id");
  });

  it("devolve o produto pelo id numérico (usado pelas telas internas) também sem stock_content", async () => {
    const res = await GET(new Request("https://example.com/api/products/" + productId), paramsFor(String(productId)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).not.toHaveProperty("stock_content");
  });
});

describe("GET /api/products/[id] — produto inativo", () => {
  let productId: number;
  let slug: string;
  let staffEmail: string;

  beforeAll(async () => {
    const db = getDB();
    slug = `teste-produto-inativo-${Date.now()}`;
    const res = await db.query(
      `INSERT INTO products (name, slug, price, product_type, active) VALUES ($1, $2, 19.9, 'digital', false) RETURNING id`,
      ["[TESTE] Produto Inativo", slug]
    );
    productId = res.rows[0].id;
    staffEmail = `teste-staff-products-read-${Date.now()}@teste.com`;
  });

  afterAll(async () => {
    await getDB().query(`DELETE FROM products WHERE id = $1`, [productId]);
  });

  it("devolve 404 pra quem não está logado (cliente comum não pode ver um produto despublicado)", async () => {
    const res = await GET(new Request("https://example.com/api/products/" + slug), paramsFor(slug));
    expect(res.status).toBe(404);
  });

  it("devolve 404 pra um cliente logado sem permissão de staff", async () => {
    cookieValue = await signJWT({ email: "teste-cliente-comum@teste.com", sid: 1, permissions: [] });
    const res = await GET(new Request("https://example.com/api/products/" + slug), paramsFor(slug));
    expect(res.status).toBe(404);
  });

  it("devolve o produto normalmente pra staff com products.read (precisa editar/reativar produtos despublicados)", async () => {
    cookieValue = await signJWT({ email: staffEmail, sid: 1, permissions: ["products.read"] });
    const res = await GET(new Request("https://example.com/api/products/" + slug), paramsFor(slug));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.active).toBe(false);
  });
});
