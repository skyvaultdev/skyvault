import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("pg");
  vi.doUnmock("@/config/configuration");
  delete (globalThis as unknown as { pgPool?: unknown }).pgPool;
});

describe("lib/database/pool — TLS mútuo opcional (deploy Square Cloud)", () => {
  it("sem nenhuma das 3 vars de SSL: conecta sem TLS, igual ao dev local de sempre", async () => {
    const poolSpy = vi.fn();
    vi.doMock("pg", () => ({ Pool: poolSpy }));
    vi.doMock("@/config/configuration", () => ({
      config: {
        database: {
          host: "localhost", user: "app_user", password: "x", database: "skybase", port: 5432,
          sslCaBase64: undefined, sslCertBase64: undefined, sslKeyBase64: undefined,
        },
      },
    }));

    const { getOrCreatePool } = await import("./pool");
    getOrCreatePool();

    expect(poolSpy).toHaveBeenCalledWith(expect.objectContaining({ ssl: undefined }));
  });

  it("com as 3 vars de SSL: decodifica base64 e monta ca/cert/key/rejectUnauthorized", async () => {
    const poolSpy = vi.fn();
    vi.doMock("pg", () => ({ Pool: poolSpy }));
    vi.doMock("@/config/configuration", () => ({
      config: {
        database: {
          host: "db.squarecloud.app", user: "app_user", password: "x", database: "skybase", port: 5432,
          sslCaBase64: Buffer.from("CONTEUDO-CA").toString("base64"),
          sslCertBase64: Buffer.from("CONTEUDO-CERT").toString("base64"),
          sslKeyBase64: Buffer.from("CONTEUDO-KEY").toString("base64"),
        },
      },
    }));

    const { getOrCreatePool } = await import("./pool");
    getOrCreatePool();

    expect(poolSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: { ca: "CONTEUDO-CA", cert: "CONTEUDO-CERT", key: "CONTEUDO-KEY", rejectUnauthorized: true },
      })
    );
  });

  it("com só UMA das 3 vars de SSL: lança erro claro (tudo-ou-nada)", async () => {
    vi.doMock("pg", () => ({ Pool: vi.fn() }));
    vi.doMock("@/config/configuration", () => ({
      config: {
        database: {
          host: "db.squarecloud.app", user: "app_user", password: "x", database: "skybase", port: 5432,
          sslCaBase64: Buffer.from("CONTEUDO-CA").toString("base64"),
          sslCertBase64: undefined,
          sslKeyBase64: undefined,
        },
      },
    }));

    const { getOrCreatePool } = await import("./pool");
    expect(() => getOrCreatePool()).toThrow(/precisam estar todas definidas juntas/);
  });
});
