import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// queryStoreId sempre bate no banco primeiro, mesmo pra hosts que vão
// cair no fallback de ALLOWED_HOSTS/root — mock devolve "nenhuma loja
// encontrada" (sem bater no banco de verdade), pra testar só a lógica do
// item C1 (ALLOWED_HOSTS, TRUSTED_PROXY, HOST_VALIDATION), isolada.
const queryMock = vi.fn(async () => ({ rows: [] }));
vi.mock("@/lib/database/pool", () => ({
  getOrCreatePool: () => ({ query: queryMock }),
}));

function mockHeaders(entries: Record<string, string>) {
  vi.doMock("next/headers", () => ({
    headers: async () => new Headers(entries),
  }));
}

describe("lib/tenant/tenantContext — validação de Host (item C1)", () => {
  beforeEach(() => {
    queryMock.mockClear();
    // O cache de host->loja fica em globalThis (sobrevive a
    // vi.resetModules()) — limpa entre testes pra cada um bater no
    // queryMock de verdade, em vez de reaproveitar o resultado de um
    // teste anterior pro mesmo host.
    (globalThis as unknown as { __storeHostCache?: Map<string, unknown> }).__storeHostCache?.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("next/headers");
  });

  it("HOST_VALIDATION=off (padrão): ignora X-Forwarded-Host por completo, mesmo com TRUSTED_PROXY=true", async () => {
    vi.stubEnv("ROOT_DOMAIN", "plataforma.com");
    vi.stubEnv("HOST_VALIDATION", "off");
    vi.stubEnv("TRUSTED_PROXY", "true");
    vi.stubEnv("ALLOWED_HOSTS", "");
    mockHeaders({ host: "plataforma.com", "x-forwarded-host": "outro-host-qualquer.com" });

    const { getCurrentStoreId } = await import("./tenantContext");
    // "plataforma.com" é o próprio ROOT_DOMAIN -> cai em defaultStoreId (1).
    expect(await getCurrentStoreId()).toBe(1);
  });

  it("HOST_VALIDATION=report: resolve com o Host puro (comportamento igual ao off), só loga a divergência", async () => {
    vi.stubEnv("ROOT_DOMAIN", "plataforma.com");
    vi.stubEnv("HOST_VALIDATION", "report");
    vi.stubEnv("TRUSTED_PROXY", "true");
    mockHeaders({ host: "plataforma.com", "x-forwarded-host": "loja-forjada.com" });

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getCurrentStoreId } = await import("./tenantContext");
    expect(await getCurrentStoreId()).toBe(1); // resolveu com "plataforma.com" (Host puro), não o forwarded
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("HOST_VALIDATION report"));
    consoleWarnSpy.mockRestore();
  });

  it("HOST_VALIDATION=enforce + TRUSTED_PROXY=true: resolve de verdade com X-Forwarded-Host", async () => {
    vi.stubEnv("ROOT_DOMAIN", "plataforma.com");
    vi.stubEnv("HOST_VALIDATION", "enforce");
    vi.stubEnv("TRUSTED_PROXY", "true");
    vi.stubEnv("ALLOWED_HOSTS", "loja-confiavel.com");
    // Host puro é algo que NÃO estaria na allowlist nem seria root — só o
    // X-Forwarded-Host está liberado. Se o enforce estiver usando o host
    // errado, isso cai em StoreNotFoundError (sem loja "host-interno-do-proxy").
    mockHeaders({ host: "host-interno-do-proxy.local", "x-forwarded-host": "loja-confiavel.com" });

    const { getCurrentStoreId } = await import("./tenantContext");
    expect(await getCurrentStoreId()).toBe(1);
  });

  it("HOST_VALIDATION=enforce + TRUSTED_PROXY=false: X-Forwarded-Host é ignorado mesmo em enforce", async () => {
    vi.stubEnv("ROOT_DOMAIN", "plataforma.com");
    vi.stubEnv("HOST_VALIDATION", "enforce");
    vi.stubEnv("TRUSTED_PROXY", "false");
    vi.stubEnv("ALLOWED_HOSTS", "loja-confiavel.com");
    mockHeaders({ host: "host-nao-confiavel.com", "x-forwarded-host": "loja-confiavel.com" });

    const { getCurrentStoreId, StoreNotFoundError } = await import("./tenantContext");
    await expect(getCurrentStoreId()).rejects.toThrow(StoreNotFoundError);
  });

  it("ALLOWED_HOSTS libera um host sem precisar de linha na tabela stores", async () => {
    vi.stubEnv("ROOT_DOMAIN", "plataforma.com");
    vi.stubEnv("HOST_VALIDATION", "enforce");
    vi.stubEnv("TRUSTED_PROXY", "false");
    vi.stubEnv("ALLOWED_HOSTS", "status.plataforma.com, outro.com");
    mockHeaders({ host: "status.plataforma.com" });

    const { getCurrentStoreId } = await import("./tenantContext");
    expect(await getCurrentStoreId()).toBe(1);
  });

  it("host desconhecido (fora de stores, ALLOWED_HOSTS e não é root) continua falhando fechado, igual sempre foi", async () => {
    vi.stubEnv("ROOT_DOMAIN", "plataforma.com");
    vi.stubEnv("HOST_VALIDATION", "off");
    mockHeaders({ host: "loja-que-nao-existe.com" });

    const { getCurrentStoreId, StoreNotFoundError } = await import("./tenantContext");
    await expect(getCurrentStoreId()).rejects.toThrow(StoreNotFoundError);
  });
});
