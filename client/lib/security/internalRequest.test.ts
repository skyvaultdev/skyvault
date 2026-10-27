import { describe, it, expect, vi } from "vitest";

vi.mock("@/config/configuration", () => ({
  config: { internalApi: { secret: "irrelevante", orchestratorToken: "token-certo-de-teste" } },
}));

const { timingSafeEqualString, verifyInternalOrchestratorHeader } = await import("./internalRequest");

describe("timingSafeEqualString", () => {
  it("true pra strings iguais, false pra diferentes (mesmo e diferente tamanho)", () => {
    expect(timingSafeEqualString("abc123", "abc123")).toBe(true);
    expect(timingSafeEqualString("abc123", "abc124")).toBe(false);
    expect(timingSafeEqualString("abc", "abcdef")).toBe(false);
    expect(timingSafeEqualString("", "")).toBe(true);
  });
});

describe("verifyInternalOrchestratorHeader", () => {
  function reqWith(header?: string) {
    const headers: Record<string, string> = {};
    if (header !== undefined) headers["x-internal-orchestrator"] = header;
    return new Request("https://example.com/", { headers });
  }

  it("true quando o header bate com o token configurado", () => {
    expect(verifyInternalOrchestratorHeader(reqWith("token-certo-de-teste"))).toBe(true);
  });

  it("false quando o header está ausente", () => {
    expect(verifyInternalOrchestratorHeader(reqWith())).toBe(false);
  });

  it("false quando o header está errado", () => {
    expect(verifyInternalOrchestratorHeader(reqWith("token-errado"))).toBe(false);
  });

  it("fail closed: sem token configurado, recusa mesmo com o header certo mandado", async () => {
    vi.resetModules();
    vi.doMock("@/config/configuration", () => ({
      config: { internalApi: { secret: "irrelevante", orchestratorToken: undefined } },
    }));
    const { verifyInternalOrchestratorHeader: verifyWithoutToken } = await import("./internalRequest");
    expect(verifyWithoutToken(reqWith("qualquer-coisa"))).toBe(false);
    vi.resetModules();
    vi.doUnmock("@/config/configuration");
  });
});
