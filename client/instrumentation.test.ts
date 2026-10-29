import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/database/init", () => ({ initApp: vi.fn().mockResolvedValue(undefined) }));
const captureExceptionMock = vi.fn();
vi.mock("@/lib/observability/sentry", () => ({
  initSentry: vi.fn(),
  captureException: captureExceptionMock,
}));

describe("instrumentation.ts register() — INTEGRATION_ENCRYPTION_KEY obrigatória em produção (item B1b)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    captureExceptionMock.mockClear();
  });

  it("aborta o boot em produção sem INTEGRATION_ENCRYPTION_KEY", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    const { register } = await import("./instrumentation");
    await expect(register()).rejects.toThrow(/INTEGRATION_ENCRYPTION_KEY não configurada em produção/);
  });

  it("não aborta em produção COM INTEGRATION_ENCRYPTION_KEY configurada", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "chave-qualquer-so-pra-passar-no-check");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

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

describe("instrumentation.ts register() — REDIS_URL ausente em produção é logada, NÃO trava o boot (item B4)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    captureExceptionMock.mockClear();
  });

  it("loga erro + manda pro Sentry, mas NÃO lança, sem REDIS_URL em produção", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "chave-qualquer-so-pra-passar-no-check");
    vi.stubEnv("REDIS_URL", "");

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { register } = await import("./instrumentation");
    await expect(register()).resolves.not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("REDIS_URL não configurada"));
    expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error), { stage: "boot" });
    consoleErrorSpy.mockRestore();
  });

  it("não loga nada em produção COM REDIS_URL configurada", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "chave-qualquer-so-pra-passar-no-check");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    const { register } = await import("./instrumentation");
    await register();

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("não loga nada fora de produção, mesmo sem REDIS_URL", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("REDIS_URL", "");

    const { register } = await import("./instrumentation");
    await register();

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
