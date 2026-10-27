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

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

afterEach(() => {
  cookieValue = undefined;
});

function jsonRequest(body: unknown) {
  return new Request("https://example.com/api/store-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/store-settings", () => {
  it("não devolve background_css (campo removido — vetor de CSS injection fechado)", async () => {
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).not.toHaveProperty("background_css");
    expect(json.data).not.toHaveProperty("backgroundCss");
  });
});

describe("POST /api/store-settings", () => {
  it("recusa sem a permissão store.customize", async () => {
    cookieValue = await signJWT({ email: "sem-permissao@teste.com", sid: 1, permissions: [] });
    const res = await POST(jsonRequest({ primaryColor: "#111111" }));
    expect(res.status).toBe(403);
  });

  it("atualiza cor primária/secundária/background_style/cor sólida corretamente (confere a renumeração dos params SQL)", async () => {
    cookieValue = await signJWT({ email: "staff-customize@teste.com", sid: 1, permissions: ["store.customize"] });

    const before = await getDB().query(`SELECT primary_color, secondary_color, background_style, background_solid_color FROM store_settings ORDER BY id DESC LIMIT 1`);

    try {
      const res = await POST(jsonRequest({
        primaryColor: "#123456",
        secondaryColor: "#654321",
        backgroundStyle: "grid",
        backgroundSolidColor: "#0a0a0a",
      }));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.primary_color).toBe("#123456");
      expect(json.data.secondary_color).toBe("#654321");
      expect(json.data.background_style).toBe("grid");
      expect(json.data.background_solid_color).toBe("#0a0a0a");

      const row = await getDB().query(`SELECT primary_color, secondary_color, background_style, background_solid_color FROM store_settings ORDER BY id DESC LIMIT 1`);
      expect(row.rows[0].primary_color).toBe("#123456");
      expect(row.rows[0].secondary_color).toBe("#654321");
      expect(row.rows[0].background_style).toBe("grid");
      expect(row.rows[0].background_solid_color).toBe("#0a0a0a");
    } finally {
      // restaura pro valor anterior pra não poluir outros testes/uso manual
      const prev = before.rows[0];
      if (prev) {
        await getDB().query(
          `UPDATE store_settings SET primary_color = $1, secondary_color = $2, background_style = $3, background_solid_color = $4 WHERE id = (SELECT id FROM store_settings ORDER BY id DESC LIMIT 1)`,
          [prev.primary_color, prev.secondary_color, prev.background_style, prev.background_solid_color]
        );
      }
    }
  });

  it("ignora um campo backgroundCss enviado por um client antigo — não quebra nem persiste nada", async () => {
    cookieValue = await signJWT({ email: "staff-customize-2@teste.com", sid: 1, permissions: ["store.customize"] });

    const res = await POST(jsonRequest({ primaryColor: "#222222", backgroundCss: "body{background:red}" }));
    expect(res.status).toBe(200);

    const row = await getDB().query(`SELECT background_css FROM store_settings ORDER BY id DESC LIMIT 1`);
    // Coluna ainda existe no banco (não foi dropada — mesma convenção de
    // colunas superadas do resto do projeto), mas nada mais escreve nela.
    expect(row.rows[0].background_css).toBeNull();
  });
});
