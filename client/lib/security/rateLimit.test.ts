import { describe, it, expect, vi, beforeEach } from "vitest";

describe("rateLimit — fallback em memória (sem REDIS_URL configurada)", () => {
  it("permite até o limite e recusa a partir daí, dentro da mesma janela", async () => {
    // Sem mock de ioredis nem de configuration aqui — exercita o caminho
    // real que roda neste ambiente de teste (.env.local não tem
    // REDIS_URL), o mesmo caminho que todas as rotas que usam rateLimit()
    // já passam nos próprios testes.
    const { rateLimit } = await import("./rateLimit");
    const key = `teste-memoria-${Date.now()}-${Math.random()}`;

    expect(await rateLimit(key, 3, 60_000)).toBe(true);
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
    expect(await rateLimit(key, 3, 60_000)).toBe(false);
    expect(await rateLimit(key, 3, 60_000)).toBe(false);
  });

  it("janelas diferentes (chaves diferentes) não interferem uma na outra", async () => {
    const { rateLimit } = await import("./rateLimit");
    const keyA = `teste-memoria-a-${Date.now()}-${Math.random()}`;
    const keyB = `teste-memoria-b-${Date.now()}-${Math.random()}`;

    expect(await rateLimit(keyA, 1, 60_000)).toBe(true);
    expect(await rateLimit(keyA, 1, 60_000)).toBe(false);
    // Chave B nunca foi chamada antes — não deve estar limitada pelo
    // consumo da chave A.
    expect(await rateLimit(keyB, 1, 60_000)).toBe(true);
  });
});

describe("rateLimit — com Redis configurado (client mockado)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("usa INCR+PEXPIRE no Redis e respeita o limite configurado", async () => {
    let callCount = 0;
    const incr = vi.fn(async () => {
      callCount++;
      return callCount;
    });
    const pexpire = vi.fn(async () => "OK");

    vi.doMock("@/config/configuration", () => ({
      config: { redis: { url: "redis://localhost:6379" } },
    }));
    vi.doMock("ioredis", () => ({
      default: class {
        incr = incr;
        pexpire = pexpire;
        on = vi.fn();
      },
    }));

    const { rateLimit } = await import("./rateLimit");
    const key = "teste-redis-incr";

    expect(await rateLimit(key, 2, 60_000)).toBe(true); // count 1
    expect(await rateLimit(key, 2, 60_000)).toBe(true); // count 2
    expect(await rateLimit(key, 2, 60_000)).toBe(false); // count 3 > limit

    expect(incr).toHaveBeenCalledWith("ratelimit:teste-redis-incr");
    // pexpire só é chamado na PRIMEIRA vez (count === 1) — não reseta o
    // TTL a cada chamada subsequente.
    expect(pexpire).toHaveBeenCalledTimes(1);
    expect(pexpire).toHaveBeenCalledWith("ratelimit:teste-redis-incr", 60_000);

    vi.doUnmock("@/config/configuration");
    vi.doUnmock("ioredis");
  });

  it("cai pro fallback em memória se o Redis lançar erro numa chamada específica", async () => {
    const incr = vi.fn(async () => {
      throw new Error("ECONNREFUSED — redis fora do ar");
    });

    vi.doMock("@/config/configuration", () => ({
      config: { redis: { url: "redis://localhost:6379" } },
    }));
    vi.doMock("ioredis", () => ({
      default: class {
        incr = incr;
        pexpire = vi.fn();
        on = vi.fn();
      },
    }));

    const warnSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rateLimit } = await import("./rateLimit");

    // Mesmo com o Redis falhando, a chamada não lança — cai pro fallback
    // em memória e ainda devolve um resultado utilizável.
    const result = await rateLimit(`teste-redis-erro-${Date.now()}`, 5, 60_000);
    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
    vi.doUnmock("@/config/configuration");
    vi.doUnmock("ioredis");
  });
});
