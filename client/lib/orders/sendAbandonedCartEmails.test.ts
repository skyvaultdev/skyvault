import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";

// sendMail bateria num SMTP real — mockado aqui, mesmo padrão já usado em
// outros testes que tocam e-mail (ex: app/api/checkout/mock-confirm-payment/route.test.ts).
const sendMailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mail/transporter", () => ({
  getMailTransporter: () => ({ sendMail: (args: unknown) => sendMailMock(args) }),
}));

const { sendAbandonedCartEmails } = await import("./sendAbandonedCartEmails");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

beforeEach(() => {
  sendMailMock.mockReset().mockResolvedValue(undefined);
});

async function createTestUser(tag: string) {
  const db = getDB();
  const email = `teste-abandonedcart-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;
  const res = await db.query(`INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`, [email, `Teste ${tag}`]);
  return { userId: res.rows[0].id as number, email };
}

async function createOldCartItem(userId: number, productId: number, hoursAgo: number) {
  const db = getDB();
  const res = await db.query(
    `INSERT INTO cart_items (user_id, product_id, quantity, added_at, updated_at)
     VALUES ($1, $2, 1, NOW() - ($3 || ' hours')::interval, NOW() - ($3 || ' hours')::interval)
     RETURNING id`,
    [userId, productId, hoursAgo]
  );
  return Number(res.rows[0].id);
}

describe("sendAbandonedCartEmails", () => {
  let userId: number;
  let userEmail: string;
  let productId: number;

  beforeAll(async () => {
    const db = getDB();
    ({ userId, email: userEmail } = await createTestUser("recovery"));

    const productRes = await db.query(
      `INSERT INTO products (name, price, product_type, is_unlimited, active) VALUES ($1, 29.9, 'digital', true, true) RETURNING id`,
      ["[TESTE] Produto Carrinho Abandonado"]
    );
    productId = productRes.rows[0].id;
  });

  afterAll(async () => {
    const db = getDB();
    await db.query(`DELETE FROM cart_items WHERE product_id = $1`, [productId]);
    await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  it("manda o e-mail de recuperação pra um carrinho parado há mais tempo que o limite", async () => {
    const itemId = await createOldCartItem(userId, productId, 30);
    try {
      const result = await sendAbandonedCartEmails(24);

      expect(result.emailsSent).toBeGreaterThanOrEqual(1);
      const matchingCall = sendMailMock.mock.calls.find((call) => (call[0] as { to: string })?.to === userEmail);
      expect(matchingCall).toBeTruthy();

      const row = await getDB().query(`SELECT recovery_email_sent_at FROM cart_items WHERE id = $1`, [itemId]);
      expect(row.rows[0].recovery_email_sent_at).not.toBeNull();
    } finally {
      await getDB().query(`DELETE FROM cart_items WHERE id = $1`, [itemId]);
    }
  });

  it("não manda de novo pro mesmo carrinho sem mudança desde o último lembrete", async () => {
    const itemId = await createOldCartItem(userId, productId, 30);
    try {
      await sendAbandonedCartEmails(24);
      sendMailMock.mockClear();

      const result = await sendAbandonedCartEmails(24);

      expect(result.emailsSent).toBe(0);
      expect(sendMailMock).not.toHaveBeenCalled();
    } finally {
      await getDB().query(`DELETE FROM cart_items WHERE id = $1`, [itemId]);
    }
  });

  it("não manda pra carrinho ainda dentro do prazo", async () => {
    const itemId = await createOldCartItem(userId, productId, 1);
    try {
      const result = await sendAbandonedCartEmails(24);
      expect(result.emailsSent).toBe(0);
    } finally {
      await getDB().query(`DELETE FROM cart_items WHERE id = $1`, [itemId]);
    }
  });
});
