import { describe, it, expect, vi, afterEach } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";

describe("lib/observability/sentry — desabilitado sem SENTRY_DSN", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("captureException não chama o SDK do Sentry quando SENTRY_DSN não está configurado", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const sentryCaptureException = vi.fn();
    vi.doMock("@sentry/nextjs", () => ({
      init: vi.fn(),
      captureException: sentryCaptureException,
    }));

    const { captureException, initSentry } = await import("./sentry");
    initSentry();
    captureException(new Error("algo quebrou"), { orderId: 123 });

    expect(sentryCaptureException).not.toHaveBeenCalled();
    vi.doUnmock("@sentry/nextjs");
  });

  it("captureException chama o SDK do Sentry quando SENTRY_DSN está configurado", async () => {
    vi.stubEnv("SENTRY_DSN", "https://teste@sentry.example/1");
    const sentryInit = vi.fn();
    const sentryCaptureException = vi.fn();
    vi.doMock("@sentry/nextjs", () => ({
      init: sentryInit,
      captureException: sentryCaptureException,
    }));

    const { captureException, initSentry } = await import("./sentry");
    initSentry();
    const error = new Error("algo quebrou");
    captureException(error, { orderId: 123, stage: "webhook" });

    expect(sentryInit).toHaveBeenCalledOnce();
    expect(sentryCaptureException).toHaveBeenCalledWith(error, { extra: { orderId: 123, stage: "webhook" } });
    vi.doUnmock("@sentry/nextjs");
  });
});

describe("lib/observability/sentry — beforeSend (scrubEvent) passado pro Sentry.init", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function captureBeforeSend() {
    vi.stubEnv("SENTRY_DSN", "https://teste@sentry.example/1");
    let capturedBeforeSend: ((event: ErrorEvent) => ErrorEvent) | undefined;
    vi.doMock("@sentry/nextjs", () => ({
      init: vi.fn((opts: { beforeSend: (event: ErrorEvent) => ErrorEvent }) => { capturedBeforeSend = opts.beforeSend; }),
      captureException: vi.fn(),
    }));
    const { initSentry } = await import("./sentry");
    initSentry();
    return capturedBeforeSend!;
  }

  it("remove cookies e headers sensíveis do evento", async () => {
    const beforeSend = await captureBeforeSend();
    const event = {
      request: {
        cookies: { auth_token: "segredo" },
        headers: {
          Authorization: "Bearer segredo",
          Cookie: "auth_token=segredo",
          "x-internal-secret": "segredo",
          "User-Agent": "Mozilla/5.0",
        },
      },
    } as unknown as ErrorEvent;

    const scrubbed = beforeSend(event);

    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.headers?.Authorization).toBeUndefined();
    expect(scrubbed.request?.headers?.Cookie).toBeUndefined();
    expect(scrubbed.request?.headers?.["x-internal-secret"]).toBeUndefined();
    expect(scrubbed.request?.headers?.["User-Agent"]).toBe("Mozilla/5.0");
    vi.doUnmock("@sentry/nextjs");
  });

  it("mascara CPF (com e sem pontuação) na mensagem de exceção e em campos extra", async () => {
    const beforeSend = await captureBeforeSend();
    const event = {
      message: "Falha ao validar CPF 123.456.789-01 do cliente",
      exception: { values: [{ value: "CPF inválido: 12345678901" }] },
      extra: { note: "cliente informou CPF 111.222.333-44 errado" },
    } as unknown as ErrorEvent;

    const scrubbed = beforeSend(event);

    expect(scrubbed.message).toBe("Falha ao validar CPF [CPF removido] do cliente");
    expect(scrubbed.exception?.values?.[0].value).toBe("CPF inválido: [CPF removido]");
    expect(scrubbed.extra?.note).toBe("cliente informou CPF [CPF removido] errado");
    vi.doUnmock("@sentry/nextjs");
  });
});
