import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "oauth_state" ? { value: "matching-state" } : undefined),
  }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

const sendWelcomeEmailMock = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/mail/sendWelcomeEmail", () => ({
  sendWelcomeEmail: (args: unknown) => sendWelcomeEmailMock(args),
}));

const { GET } = await import("./route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

let webhookCalls: Array<{ url: string; body: unknown }> = [];

function mockFetch(email: string, name: string) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "fake-access-token", expires_in: 3600 }), { status: 200 });
    }
    if (url === "https://www.googleapis.com/oauth2/v3/userinfo") {
      return new Response(JSON.stringify({ email, name, email_verified: true }), { status: 200 });
    }
    // Qualquer outra URL é o webhook do Discord — captura o corpo em vez
    // de bater de verdade na internet.
    webhookCalls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(null, { status: 204 });
  });
}

afterEach(() => {
  webhookCalls = [];
  sendWelcomeEmailMock.mockClear();
  vi.unstubAllGlobals();
});

function callbackRequest() {
  return new Request("https://example.com/api/auth/google/callback?code=fake-code&state=matching-state");
}

describe("GET /api/auth/google/callback — webhook de login não manda email/IP (Fase 4)", () => {
  it("o payload do webhook não contém o email nem a palavra IP, só Provedor/ID interno/Username", async () => {
    const db = getDB();
    const email = `teste-google-webhook-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;
    vi.stubGlobal("fetch", mockFetch(email, "Fulano de Tal"));

    try {
      const res = await GET(callbackRequest());
      expect(res.status).toBe(307); // redirect

      expect(webhookCalls).toHaveLength(1);
      const payload = webhookCalls[0].body as { embeds: Array<{ fields: Array<{ name: string; value: string }> }> };
      const fields = payload.embeds[0].fields;
      const fieldNames = fields.map((f) => f.name);

      expect(fieldNames).not.toContain("Email");
      expect(fieldNames).not.toContain("IP");
      expect(fieldNames).toContain("Provedor");
      expect(fieldNames).toContain("ID interno");

      // Garante que o email não vaza escondido em NENHUM campo (ex: dentro
      // do valor de "Username" por engano).
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain(email);

      const provedorField = fields.find((f) => f.name === "Provedor");
      expect(provedorField?.value).toBe("Google");

      const idField = fields.find((f) => f.name === "ID interno");
      const userRow = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);
      expect(idField?.value).toBe(String(userRow.rows[0].id));
    } finally {
      await db.query(`DELETE FROM googleuser WHERE email = $1`, [email]);
      await db.query(`DELETE FROM users WHERE email = $1`, [email]);
    }
  });
});

describe("GET /api/auth/google/callback — não guarda tokens do Google (item B1a)", () => {
  it("cria o usuário e completa o login (cookie + redirect) sem gravar access_token/refresh_token/expires_in", async () => {
    const db = getDB();
    const email = `teste-google-no-token-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;
    vi.stubGlobal("fetch", mockFetch(email, "Fulano Sem Token"));

    try {
      const res = await GET(callbackRequest());
      expect(res.status).toBe(307); // redirect
      expect(res.headers.get("set-cookie")).toContain("auth_token=");

      const row = await db.query(
        `SELECT access_token, refresh_token, expires_in FROM googleuser WHERE email = $1`,
        [email]
      );
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].access_token).toBeNull();
      expect(row.rows[0].refresh_token).toBeNull();
      expect(row.rows[0].expires_in).toBeNull();
    } finally {
      await db.query(`DELETE FROM googleuser WHERE email = $1`, [email]);
      await db.query(`DELETE FROM users WHERE email = $1`, [email]);
    }
  });
});

describe("GET /api/auth/google/callback — email de boas-vindas (Fase 5)", () => {
  it("manda o email de boas-vindas no PRIMEIRO login, mas não de novo num segundo login da mesma conta", async () => {
    const db = getDB();
    const email = `teste-google-welcome-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;

    try {
      vi.stubGlobal("fetch", mockFetch(email, "Ciclano"));
      await GET(callbackRequest());
      expect(sendWelcomeEmailMock).toHaveBeenCalledOnce();
      expect(sendWelcomeEmailMock).toHaveBeenCalledWith({ to: email, name: "Ciclano" });

      sendWelcomeEmailMock.mockClear();
      vi.unstubAllGlobals();
      vi.stubGlobal("fetch", mockFetch(email, "Ciclano"));
      await GET(callbackRequest());
      expect(sendWelcomeEmailMock).not.toHaveBeenCalled();
    } finally {
      await db.query(`DELETE FROM googleuser WHERE email = $1`, [email]);
      await db.query(`DELETE FROM users WHERE email = $1`, [email]);
    }
  });
});
