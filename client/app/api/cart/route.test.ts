import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { signJWT } from "@/lib/jwt/init";

// Mesmo padrão dos outros testes de rota desta leva: integração contra o
// banco real, só next/headers simulado (cookies()/headers() exigem o
// runtime de requisição do Next, que não existe fora de um server de
// verdade) pra poder chamar o handler da rota diretamente.
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "auth_token" && cookieValue ? { value: cookieValue } : undefined) }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

const { PUT } = await import("./route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

afterEach(() => {
  cookieValue = undefined;
});

function putRequest(body: unknown) {
  return new Request("https://example.com/api/cart", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

async function createTestUser(tag: string) {
  const db = getDB();
  const email = `teste-cart-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;
  const res = await db.query(`INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`, [email, `Teste ${tag}`]);
  return { userId: res.rows[0].id as number, email };
}

describe("PUT /api/cart", () => {
  let userId: number;
  let email: string;

  beforeAll(async () => {
    ({ userId, email } = await createTestUser("guard"));
  });

  afterAll(async () => {
    await getDB().query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  afterEach(async () => {
    await getDB().query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);
  });

  it("recusa adicionar um produto inativo ao carrinho", async () => {
    const db = getDB();
    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, is_unlimited, active) VALUES ($1, 10, 'digital', true, false) RETURNING id`,
      ["[TESTE] Produto Inativo Carrinho"]
    );
    const productId = productRes.rows[0].id;
    try {
      cookieValue = await signJWT({ email, sid: 1 });
      const res = await PUT(putRequest({ product_id: productId, quantity: 1 }));
      expect(res.status).toBe(404);

      const cartRows = await db.query(`SELECT 1 FROM cart_items WHERE user_id = $1 AND product_id = $2`, [userId, productId]);
      expect(cartRows.rows).toHaveLength(0);
    } finally {
      await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
  });

  it("exige variation_id quando o produto tem variações cadastradas — não deixa comprar pelo preço base", async () => {
    const db = getDB();
    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, is_unlimited, active) VALUES ($1, 10, 'digital', true, true) RETURNING id`,
      ["[TESTE] Produto Com Variação Carrinho"]
    );
    const productId = productRes.rows[0].id;
    const variationRes = await db.query(
      `INSERT INTO product_variations (product_id, name, price, is_unlimited) VALUES ($1, 'Padrão', 15, true) RETURNING id`,
      [productId]
    );
    const variationId = variationRes.rows[0].id;
    try {
      cookieValue = await signJWT({ email, sid: 1 });

      const semVariacao = await PUT(putRequest({ product_id: productId, quantity: 1 }));
      expect(semVariacao.status).toBe(400);
      const semVariacaoJson = await semVariacao.json();
      expect(semVariacaoJson.error).toBe("VARIATION_REQUIRED");

      const variacaoDeOutroProduto = await PUT(putRequest({ product_id: productId, variation_id: 999999999, quantity: 1 }));
      expect(variacaoDeOutroProduto.status).toBe(400);

      const comVariacao = await PUT(putRequest({ product_id: productId, variation_id: variationId, quantity: 1 }));
      expect(comVariacao.status).toBe(200);

      const cartRows = await db.query(`SELECT variation_id FROM cart_items WHERE user_id = $1 AND product_id = $2`, [userId, productId]);
      expect(cartRows.rows).toHaveLength(1);
      expect(Number(cartRows.rows[0].variation_id)).toBe(variationId);
    } finally {
      await db.query(`DELETE FROM cart_items WHERE product_id = $1`, [productId]);
      await db.query(`DELETE FROM product_variations WHERE product_id = $1`, [productId]);
      await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
  });

  it("recusa quantity não-inteira ou não-positiva", async () => {
    const db = getDB();
    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, is_unlimited, active) VALUES ($1, 10, 'digital', true, true) RETURNING id`,
      ["[TESTE] Produto Quantidade Carrinho"]
    );
    const productId = productRes.rows[0].id;
    try {
      cookieValue = await signJWT({ email, sid: 1 });

      for (const quantity of [1.5, 0, -1, "abc"]) {
        const res = await PUT(putRequest({ product_id: productId, quantity }));
        expect(res.status, `quantity=${quantity}`).toBe(400);
      }

      const cartRows = await db.query(`SELECT 1 FROM cart_items WHERE user_id = $1 AND product_id = $2`, [userId, productId]);
      expect(cartRows.rows).toHaveLength(0);
    } finally {
      await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
  });
});
