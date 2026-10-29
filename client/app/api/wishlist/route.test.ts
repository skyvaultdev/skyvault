import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { signJWT } from "@/lib/jwt/init";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "auth_token" && cookieValue ? { value: cookieValue } : undefined) }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

const { GET, POST } = await import("./route");
const { DELETE } = await import("./[productId]/route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

afterEach(() => {
  cookieValue = undefined;
});

async function createTestUser(tag: string) {
  const db = getDB();
  const email = `teste-wishlist-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;
  const res = await db.query(`INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`, [email, `Teste ${tag}`]);
  return { userId: res.rows[0].id as number, email };
}

function postRequest(body: unknown) {
  return new Request("https://example.com/api/wishlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function paramsFor(productId: string) {
  return { params: Promise.resolve({ productId }) };
}

describe("POST/GET/DELETE /api/wishlist — grava store_id corretamente sob RLS forçada", () => {
  it("adiciona, lista e remove um item, e a linha grava com o store_id da conexão (não NULL)", async () => {
    const db = getDB();
    const { userId, email } = await createTestUser("flow");
    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_content, stock_count, is_unlimited, active)
       VALUES ($1, 10, 'digital', 'infinite', 'Entrega automática ativada', 10, false, true) RETURNING id`,
      ["[TESTE] Produto Wishlist"]
    );
    const productId = productRes.rows[0].id;

    try {
      cookieValue = await signJWT({ email, sid: 1 });

      const postRes = await POST(postRequest({ productId }));
      expect(postRes.status).toBe(200);

      // A migration 2026-10-28 tornou store_id NOT NULL com DEFAULT ligado
      // à conexão (app.store_id) — se o DEFAULT não disparasse direito sob
      // RLS forçada, o INSERT acima teria falhado em vez de gravar NULL.
      const row = await db.query(`SELECT store_id FROM wishlist_items WHERE user_id = $1 AND product_id = $2`, [userId, productId]);
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].store_id).not.toBeNull();

      const getRes = await GET();
      const getJson = await getRes.json();
      expect(getJson.data).toHaveLength(1);
      expect(Number(getJson.data[0].product_id)).toBe(Number(productId));

      const deleteRes = await DELETE(new Request("https://example.com"), paramsFor(String(productId)));
      expect(deleteRes.status).toBe(200);

      const afterDelete = await db.query(`SELECT 1 FROM wishlist_items WHERE user_id = $1 AND product_id = $2`, [userId, productId]);
      expect(afterDelete.rows).toHaveLength(0);
    } finally {
      await db.query(`DELETE FROM wishlist_items WHERE user_id = $1`, [userId]);
      await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
      await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it("recusa sem sessão", async () => {
    const res = await POST(postRequest({ productId: 1 }));
    expect(res.status).not.toBe(200);
  });
});
