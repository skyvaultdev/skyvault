import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "oauth_state" ? { value: "matching-state" } : undefined),
  }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

const { GET } = await import("./route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

let webhookCalls: Array<{ url: string; body: unknown }> = [];

function mockFetch(email: string, username: string, discordId: string) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url === "https://discord.com/api/v10/oauth2/token") {
      return new Response(JSON.stringify({ access_token: "fake-access-token", refresh_token: "fake-refresh-token", expires_in: 3600 }), { status: 200 });
    }
    if (url === "https://discord.com/api/v10/users/@me") {
      return new Response(JSON.stringify({ email, username, id: discordId }), { status: 200 });
    }
    // Qualquer outra URL é o webhook do Discord — captura o corpo em vez
    // de bater de verdade na internet.
    webhookCalls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(null, { status: 204 });
  });
}

afterEach(() => {
  webhookCalls = [];
  vi.unstubAllGlobals();
});

function callbackRequest() {
  return new Request("https://example.com/api/auth/discord/callback?code=fake-code&state=matching-state");
}

describe("GET /api/auth/discord/callback — webhook de login não manda email (Fase 4)", () => {
  it("o payload do webhook não contém o email nem o ID externo do Discord, só Provedor/ID interno/Usuário", async () => {
    const db = getDB();
    const email = `teste-discord-webhook-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;
    const discordExternalId = "999999999999999999";
    vi.stubGlobal("fetch", mockFetch(email, "fulano_discord", discordExternalId));

    try {
      const res = await GET(callbackRequest());
      expect(res.status).toBe(307); // redirect

      expect(webhookCalls).toHaveLength(1);
      const payload = webhookCalls[0].body as { embeds: Array<{ fields: Array<{ name: string; value: string }> }> };
      const fields = payload.embeds[0].fields;
      const fieldNames = fields.map((f) => f.name);

      expect(fieldNames).not.toContain("Email");
      expect(fieldNames).not.toContain("ID"); // campo antigo mandava o ID EXTERNO do Discord
      expect(fieldNames).toContain("Provedor");
      expect(fieldNames).toContain("ID interno");

      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain(email);
      expect(serialized).not.toContain(discordExternalId);

      const provedorField = fields.find((f) => f.name === "Provedor");
      expect(provedorField?.value).toBe("Discord");

      const idField = fields.find((f) => f.name === "ID interno");
      const userRow = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);
      expect(idField?.value).toBe(String(userRow.rows[0].id));
    } finally {
      await db.query(`DELETE FROM discuser WHERE email = $1`, [email]);
      await db.query(`DELETE FROM users WHERE email = $1`, [email]);
    }
  });
});
