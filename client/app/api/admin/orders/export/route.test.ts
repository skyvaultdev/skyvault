import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { signJWT } from "@/lib/jwt/init";

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

describe("GET /api/admin/orders/export", () => {
  let userId: number;
  let email: string;
  let orderId: number;

  beforeAll(async () => {
    const db = getDB();
    email = `teste-ordersexport-${Date.now()}@teste.com`;
    const userRes = await db.query(`INSERT INTO users (email, username) VALUES ($1, 'Teste Export') RETURNING id`, [email]);
    userId = userRes.rows[0].id;

    const orderRes = await db.query(
      `INSERT INTO orders (user_id, status, order_number, subtotal, discount, shipping_fee, total) VALUES ($1, 'delivered', 'TESTE-EXPORT-1', 50, 5, 0, 45) RETURNING id`,
      [userId]
    );
    orderId = orderRes.rows[0].id;
  });

  afterAll(async () => {
    const db = getDB();
    await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  it("devolve um CSV com o pedido, com cabeçalho e dados corretos", async () => {
    cookieValue = await signJWT({ email: "teste-staff-export@teste.com", sid: 1, permissions: ["orders.read"] });
    const res = await GET(new Request("https://example.com/api/admin/orders/export"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");

    const text = await res.text();
    const lines = text.split("\n");
    expect(lines[0]).toBe("id,numero_pedido,status,email_cliente,subtotal,desconto,frete,total,criado_em,pago_em");
    expect(text).toContain("TESTE-EXPORT-1");
    expect(text).toContain(email);
  });

  it("recusa sem a permissão orders.read", async () => {
    cookieValue = await signJWT({ email: "teste-sem-permissao-export@teste.com", sid: 1, permissions: [] });
    const res = await GET(new Request("https://example.com/api/admin/orders/export"));
    expect(res.status).not.toBe(200);
  });
});
