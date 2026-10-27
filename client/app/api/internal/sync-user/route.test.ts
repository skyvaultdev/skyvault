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

function syncRequest(headers: Record<string, string>) {
  return new Request("https://example.com/api/internal/sync-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ email: "nao-existe@teste.com", sid: 1 }),
  });
}

describe("POST /api/internal/sync-user — segunda camada (x-internal-orchestrator)", () => {
  it("recusa sem nenhum header", async () => {
    const res = await POST(syncRequest({}));
    expect(res.status).toBe(401);
  });

  it("recusa com só x-internal-secret (sem x-internal-orchestrator)", async () => {
    const res = await POST(syncRequest({ "x-internal-secret": config.internalApi.secret }));
    expect(res.status).toBe(401);
  });

  it("recusa com x-internal-orchestrator errado", async () => {
    const res = await POST(syncRequest({
      "x-internal-secret": config.internalApi.secret,
      "x-internal-orchestrator": "token-claramente-errado",
    }));
    expect(res.status).toBe(401);
  });

  it("recusa com só x-internal-orchestrator certo (sem x-internal-secret)", async () => {
    const res = await POST(syncRequest({
      "x-internal-orchestrator": config.internalApi.orchestratorToken ?? "",
    }));
    expect(res.status).toBe(401);
  });

  it("aceita com os dois headers corretos", async () => {
    const res = await POST(syncRequest({
      "x-internal-secret": config.internalApi.secret,
      "x-internal-orchestrator": config.internalApi.orchestratorToken ?? "",
    }));
    expect(res.status).toBe(200);
  });
});
