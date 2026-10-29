import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mocka os dois middlewares de página — este arquivo testa só o roteamento
// do proxy.ts em si (item B2: bloqueio de /api/internal/** sem o header),
// não a lógica interna de auth.middleware.ts/devAuth.middleware.ts (cada
// um já tem seu próprio teste, se houver).
vi.mock("@/middlewares/auth.middleware", () => ({
  authMiddleware: vi.fn(() => new Response(null, { status: 200 })),
}));
vi.mock("@/middlewares/devAuth.middleware", () => ({
  devAuthMiddleware: vi.fn(() => new Response(null, { status: 200 })),
}));

describe("proxy.ts — /api/internal/** exige x-internal-orchestrator antes do handler (item B2)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sem o header: 404 (não revela que a rota existe)", async () => {
    vi.stubEnv("INTERNAL_ORCHESTRATOR_TOKEN", "token-correto-de-teste");
    const { default: proxy } = await import("./proxy");

    const req = new NextRequest("https://example.com/api/internal/sync-user", { method: "POST" });
    const res = await proxy(req);
    expect(res.status).toBe(404);
  });

  it("com o header errado: 404", async () => {
    vi.stubEnv("INTERNAL_ORCHESTRATOR_TOKEN", "token-correto-de-teste");
    const { default: proxy } = await import("./proxy");

    const req = new NextRequest("https://example.com/api/internal/cron/expire-orders", {
      method: "POST",
      headers: { "x-internal-orchestrator": "token-errado" },
    });
    const res = await proxy(req);
    expect(res.status).toBe(404);
  });

  it("com o header certo: deixa passar (NextResponse.next())", async () => {
    vi.stubEnv("INTERNAL_ORCHESTRATOR_TOKEN", "token-correto-de-teste");
    const { default: proxy } = await import("./proxy");

    const req = new NextRequest("https://example.com/api/internal/sync-user", {
      method: "POST",
      headers: { "x-internal-orchestrator": "token-correto-de-teste" },
    });
    const res = await proxy(req);
    // NextResponse.next() não tem status de erro — segue pro handler da rota.
    expect(res.status).not.toBe(404);
  });

  it("sem INTERNAL_ORCHESTRATOR_TOKEN configurada: 404 mesmo com um header qualquer (fail closed)", async () => {
    vi.stubEnv("INTERNAL_ORCHESTRATOR_TOKEN", "");
    const { default: proxy } = await import("./proxy");

    const req = new NextRequest("https://example.com/api/internal/sync-user", {
      method: "POST",
      headers: { "x-internal-orchestrator": "qualquer-coisa" },
    });
    const res = await proxy(req);
    expect(res.status).toBe(404);
  });

  it("rotas fora de /api/internal continuam indo pro middleware normal", async () => {
    const { authMiddleware } = await import("@/middlewares/auth.middleware");
    const { default: proxy } = await import("./proxy");

    const req = new NextRequest("https://example.com/dashboard");
    proxy(req);
    expect(authMiddleware).toHaveBeenCalledWith(req);
  });
});
