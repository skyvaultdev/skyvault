import { describe, it, expect, afterEach, vi } from "vitest";

// Teste de unidade puro (sem banco) — getPaymentProvider() só decide com
// base em process.env/config, então não precisa da infraestrutura de
// integração usada em confirmOrderPayment.test.ts. Cada teste mexe em
// process.env e usa vi.resetModules() pra forçar config/configuration.ts a
// reler o ambiente, depois restaura tudo em afterEach pra não vazar pro
// resto da suíte.
const TOUCHED_KEYS = ["NODE_ENV", "PAYMENT_PROVIDER", "MERCADO_PAGO_ACCESS_TOKEN", "MERCADO_PAGO_PUBLIC_KEY"] as const;
const ORIGINAL: Record<string, string | undefined> = {};
for (const key of TOUCHED_KEYS) ORIGINAL[key] = process.env[key];

afterEach(() => {
  const env = process.env as Record<string, string | undefined>;
  for (const key of TOUCHED_KEYS as readonly string[]) {
    if (ORIGINAL[key] === undefined) delete env[key];
    else env[key] = ORIGINAL[key];
  }
  vi.resetModules();
});

describe("getPaymentProvider — nunca cai no mock escondido em produção", () => {
  it("em produção, sem credenciais do Mercado Pago e sem PAYMENT_PROVIDER=mock, lança PaymentNotConfiguredError em vez de usar o mock", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.PAYMENT_PROVIDER;
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    delete process.env.MERCADO_PAGO_PUBLIC_KEY;
    vi.resetModules();

    const { getPaymentProvider, PaymentNotConfiguredError } = await import("./index");
    await expect(getPaymentProvider()).rejects.toThrow(PaymentNotConfiguredError);
  });

  it("fora de produção, sem credenciais, cai no mock normalmente (conveniência de dev)", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    delete process.env.PAYMENT_PROVIDER;
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    delete process.env.MERCADO_PAGO_PUBLIC_KEY;
    vi.resetModules();

    const { getPaymentProvider } = await import("./index");
    const provider = await getPaymentProvider();
    expect(provider.name).toBe("mock");
  });

  it("mesmo em produção, PAYMENT_PROVIDER=mock explícito ainda funciona (atalho deliberado de quem administra o servidor)", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.PAYMENT_PROVIDER = "mock";
    vi.resetModules();

    const { getPaymentProvider } = await import("./index");
    const provider = await getPaymentProvider();
    expect(provider.name).toBe("mock");
  });

  it("em produção, com credenciais do Mercado Pago configuradas, usa o provider real normalmente", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.PAYMENT_PROVIDER;
    process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-access-token";
    process.env.MERCADO_PAGO_PUBLIC_KEY = "TEST-public-key";
    vi.resetModules();

    const { getPaymentProvider } = await import("./index");
    const provider = await getPaymentProvider();
    expect(provider.name).toBe("mercadopago");
  });
});
