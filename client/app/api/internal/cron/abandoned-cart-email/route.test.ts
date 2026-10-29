import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { config } from "@/config/configuration";

const { POST } = await import("./route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

function cronRequest(headers: Record<string, string>) {
  return new Request("https://example.com/api/internal/cron/abandoned-cart-email", {
    method: "POST",
    headers,
  });
}

describe("POST /api/internal/cron/abandoned-cart-email — segunda camada (x-internal-orchestrator)", () => {
  it("recusa sem nenhum header", async () => {
    const res = await POST(cronRequest({}));
    expect(res.status).toBe(401);
  });

  it("recusa com x-cron-secret certo mas sem x-internal-orchestrator", async () => {
    const res = await POST(cronRequest({ "x-cron-secret": config.cron.secret ?? "" }));
    expect(res.status).toBe(401);
  });

  it("recusa com x-internal-orchestrator errado", async () => {
    const res = await POST(cronRequest({
      "x-cron-secret": config.cron.secret ?? "",
      "x-internal-orchestrator": "token-claramente-errado",
    }));
    expect(res.status).toBe(401);
  });

  it("aceita com os dois headers corretos", async () => {
    const res = await POST(cronRequest({
      "x-cron-secret": config.cron.secret ?? "",
      "x-internal-orchestrator": config.internalApi.orchestratorToken ?? "",
    }));
    expect(res.status).toBe(200);
  });
});
