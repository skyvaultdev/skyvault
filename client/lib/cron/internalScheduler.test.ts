import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

describe("lib/cron/internalScheduler — item e (disparo sem agendador nativo)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("não inicia nada sem INTERNAL_CRON_ENABLED=true", async () => {
    vi.stubEnv("INTERNAL_CRON_ENABLED", "false");
    vi.stubEnv("CRON_SECRET", "segredo-cron");
    vi.stubEnv("INTERNAL_ORCHESTRATOR_TOKEN", "segredo-orchestrator");
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { startInternalCronScheduler } = await import("./internalScheduler");
    startInternalCronScheduler();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("não inicia sem CRON_SECRET/INTERNAL_ORCHESTRATOR_TOKEN configurados, mesmo com INTERNAL_CRON_ENABLED=true", async () => {
    vi.stubEnv("INTERNAL_CRON_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("INTERNAL_ORCHESTRATOR_TOKEN", "");
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { startInternalCronScheduler } = await import("./internalScheduler");
    startInternalCronScheduler();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("NÃO iniciado"));
    consoleErrorSpy.mockRestore();
  });

  it("ligado e configurado: chama as 2 rotas via loopback (127.0.0.1) com os 2 headers, a cada hora", async () => {
    vi.stubEnv("INTERNAL_CRON_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "segredo-cron");
    vi.stubEnv("INTERNAL_ORCHESTRATOR_TOKEN", "segredo-orchestrator");
    vi.stubEnv("PORT", "4000");
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { startInternalCronScheduler } = await import("./internalScheduler");
    startInternalCronScheduler();

    // Nada dispara antes de completar 1h.
    expect(fetchSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/internal/cron/expire-orders",
      expect.objectContaining({
        method: "POST",
        headers: { "x-cron-secret": "segredo-cron", "x-internal-orchestrator": "segredo-orchestrator" },
      })
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/internal/cron/abandoned-cart-email",
      expect.objectContaining({
        method: "POST",
        headers: { "x-cron-secret": "segredo-cron", "x-internal-orchestrator": "segredo-orchestrator" },
      })
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("chamar startInternalCronScheduler() duas vezes não duplica os intervalos (guard 'started')", async () => {
    vi.stubEnv("INTERNAL_CRON_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "segredo-cron");
    vi.stubEnv("INTERNAL_ORCHESTRATOR_TOKEN", "segredo-orchestrator");
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { startInternalCronScheduler } = await import("./internalScheduler");
    startInternalCronScheduler();
    startInternalCronScheduler();
    startInternalCronScheduler();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    // 2 rotas, não 4 ou 6 — se tivesse duplicado o setInterval, viria mais.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("loga erro (não lança) quando a rota responde com status de erro", async () => {
    vi.stubEnv("INTERNAL_CRON_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "segredo-cron");
    vi.stubEnv("INTERNAL_ORCHESTRATOR_TOKEN", "segredo-orchestrator");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { startInternalCronScheduler } = await import("./internalScheduler");
    startInternalCronScheduler();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("respondeu 500"));
    consoleErrorSpy.mockRestore();
  });
});
