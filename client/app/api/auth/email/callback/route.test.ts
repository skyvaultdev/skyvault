import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createHash } from "crypto";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

const sendWelcomeEmailMock = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/mail/sendWelcomeEmail", () => ({
  sendWelcomeEmail: (args: unknown) => sendWelcomeEmailMock(args),
}));

const { POST } = await import("./route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

afterEach(() => {
  sendWelcomeEmailMock.mockClear();
});

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

async function seedValidCode(email: string, code: string) {
  await getDB().query(
    `INSERT INTO email_verification (email, code_hash, expires_at) VALUES ($1, $2, NOW() + interval '10 minutes')`,
    [email, hashCode(code)]
  );
}

function verifyRequest(email: string, code: string) {
  return new Request("https://example.com/api/auth/email/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
}

describe("POST /api/auth/email/callback — email de boas-vindas (Fase 5)", () => {
  it("manda o email de boas-vindas no PRIMEIRO login por código, mas não de novo num segundo login da mesma conta", async () => {
    const db = getDB();
    const email = `teste-magiclink-welcome-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;

    try {
      await seedValidCode(email, "111111");
      const first = await POST(verifyRequest(email, "111111"));
      expect(first.status).toBe(200);
      expect(sendWelcomeEmailMock).toHaveBeenCalledOnce();
      expect(sendWelcomeEmailMock).toHaveBeenCalledWith({ to: email, name: email.split("@")[0] });

      sendWelcomeEmailMock.mockClear();
      await seedValidCode(email, "222222");
      const second = await POST(verifyRequest(email, "222222"));
      expect(second.status).toBe(200);
      expect(sendWelcomeEmailMock).not.toHaveBeenCalled();
    } finally {
      await db.query(`DELETE FROM email_verification WHERE email = $1`, [email]);
      await db.query(`DELETE FROM users WHERE email = $1`, [email]);
    }
  });

  it("não manda o email de boas-vindas quando o código está errado", async () => {
    const email = `teste-magiclink-wrongcode-${Date.now()}@teste.com`;
    try {
      await seedValidCode(email, "333333");
      const res = await POST(verifyRequest(email, "000000"));
      expect(res.status).toBe(401);
      expect(sendWelcomeEmailMock).not.toHaveBeenCalled();
    } finally {
      await getDB().query(`DELETE FROM email_verification WHERE email = $1`, [email]);
      await getDB().query(`DELETE FROM users WHERE email = $1`, [email]);
    }
  });
});
