import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { signJWT } from "@/lib/jwt/init";

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

function patchRequest(body: unknown) {
  return new Request("https://example.com/api/admin/data-requests/1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createTestUser(tag: string) {
  const db = getDB();
  const email = `teste-datarequest-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;
  const res = await db.query(`INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`, [email, `Teste ${tag}`]);
  return { userId: res.rows[0].id as number, email };
}

async function createPendingRequest(userId: number) {
  const res = await getDB().query(`INSERT INTO data_subject_requests (user_id) VALUES ($1) RETURNING id`, [userId]);
  return Number(res.rows[0].id);
}

describe("POST /api/admin/data-requests/[id]", () => {
  let ownerEmail: string;

  beforeAll(() => {
    ownerEmail = `teste-owner-datarequest-${Date.now()}@teste.com`;
  });

  it("anonimiza a conta: apaga perfil/endereço e troca email/nome, sem apagar a linha de users (pedidos continuam ligados)", async () => {
    const db = getDB();
    const { userId, email } = await createTestUser("anonymize");

    await db.query(
      `INSERT INTO customer_profiles (email, full_name, phone, cep, street, number, neighborhood, city, state)
       VALUES ($1, 'Fulano de Tal', '11999999999', '01310100', 'Av. Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP')`,
      [email]
    );
    await db.query(
      `INSERT INTO shipping_addresses (user_id, recipient_name, cep, street, number, neighborhood, city, state)
       VALUES ($1, 'Fulano de Tal', '01310100', 'Av. Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP')`,
      [userId]
    );
    const orderRes = await db.query(
      `INSERT INTO orders (user_id, status, subtotal, total) VALUES ($1, 'delivered', 50, 50) RETURNING id`,
      [userId]
    );
    const orderId = Number(orderRes.rows[0].id);
    const requestId = await createPendingRequest(userId);

    try {
      cookieValue = await signJWT({ email: ownerEmail, sid: 1, permissions: ["users.manage"] });
      const res = await POST(patchRequest({ action: "anonymize" }), paramsFor(String(requestId)));
      expect(res.status).toBe(200);

      const userRow = await db.query(`SELECT email, username FROM users WHERE id = $1`, [userId]);
      expect(userRow.rows[0].email).toBe(`removido-${userId}@anonimizado.local`);
      expect(userRow.rows[0].username).toBe("Usuário removido");

      const profileRow = await db.query(`SELECT 1 FROM customer_profiles WHERE email = $1`, [email]);
      expect(profileRow.rows).toHaveLength(0);

      const addressRow = await db.query(`SELECT 1 FROM shipping_addresses WHERE user_id = $1`, [userId]);
      expect(addressRow.rows).toHaveLength(0);

      // Pedido continua existindo, ainda ligado ao mesmo user_id.
      const orderRow = await db.query(`SELECT user_id FROM orders WHERE id = $1`, [orderId]);
      expect(Number(orderRow.rows[0].user_id)).toBe(userId);

      const requestRow = await db.query(`SELECT status, processed_by FROM data_subject_requests WHERE id = $1`, [requestId]);
      expect(requestRow.rows[0].status).toBe("completed");
      expect(requestRow.rows[0].processed_by).toBe(ownerEmail);
    } finally {
      await db.query(`DELETE FROM data_subject_requests WHERE id = $1`, [requestId]);
      await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
      await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it("recusa sem a permissão users.manage", async () => {
    const { userId } = await createTestUser("no-permission");
    const requestId = await createPendingRequest(userId);

    try {
      cookieValue = await signJWT({ email: "teste-sem-permissao-lgpd@teste.com", sid: 1, permissions: [] });
      const res = await POST(patchRequest({ action: "anonymize" }), paramsFor(String(requestId)));
      expect(res.status).not.toBe(200);

      const row = await getDB().query(`SELECT status FROM data_subject_requests WHERE id = $1`, [requestId]);
      expect(row.rows[0].status).toBe("pending");
    } finally {
      await getDB().query(`DELETE FROM data_subject_requests WHERE id = $1`, [requestId]);
      await getDB().query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });
});
