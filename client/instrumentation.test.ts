import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/database/init", () => ({ initApp: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/observability/sentry", () => ({ initSentry: vi.fn() }));

describe("instrumentation.ts register() — INTEGRATION_ENCRYPTION_KEY obrigatória em produção (item B1b)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("aborta o boot em produção sem INTEGRATION_ENCRYPTION_KEY", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");

    const { register } = await import("./instrumentation");
    await expect(register()).rejects.toThrow(/INTEGRATION_ENCRYPTION_KEY não configurada em produção/);
  });

  it("não aborta em produção COM INTEGRATION_ENCRYPTION_KEY configurada", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "chave-qualquer-so-pra-passar-no-check");

    const { register } = await import("./instrumentation");
    await expect(register()).resolves.not.toThrow();
  });

  it("não aborta fora de produção (dev/test), mesmo sem a chave", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");

    const { register } = await import("./instrumentation");
    await expect(register()).resolves.not.toThrow();
  });
});
