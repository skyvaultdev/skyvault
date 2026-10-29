import { describe, it, expect, vi, afterEach } from "vitest";

describe("lib/security/tokenCrypto — chave própria (INTEGRATION_ENCRYPTION_KEY), formato v2:", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("cifra e decifra, roundtrip correto, com prefixo v2:", async () => {
    const crypto = await import("crypto");
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));
    vi.stubEnv("JWT_SECRET", "segredo-de-sessao-nao-deve-ser-usado-aqui");

    const { encryptToken, decryptToken } = await import("./tokenCrypto");
    const stored = encryptToken("token-secreto-do-melhor-envio");
    expect(stored.startsWith("v2:")).toBe(true);
    expect(stored).not.toContain("token-secreto-do-melhor-envio");

    expect(decryptToken(stored)).toBe("token-secreto-do-melhor-envio");
  });

  it("lança erro claro sem INTEGRATION_ENCRYPTION_KEY configurada", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");
    vi.stubEnv("JWT_SECRET", "segredo-de-sessao");

    const { encryptToken } = await import("./tokenCrypto");
    expect(() => encryptToken("qualquer coisa")).toThrow(/INTEGRATION_ENCRYPTION_KEY não configurada/);
  });

  it("lança erro claro com chave de tamanho errado", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", Buffer.from("chave-curta-demais").toString("base64"));
    vi.stubEnv("JWT_SECRET", "segredo-de-sessao");

    const { encryptToken } = await import("./tokenCrypto");
    expect(() => encryptToken("qualquer coisa")).toThrow(/INTEGRATION_ENCRYPTION_KEY inválida/);
  });

  it("fallback: decifra ciphertext no formato antigo (sem prefixo v2:, cifrado com sha256(JWT_SECRET))", async () => {
    const crypto = await import("crypto");
    const jwtSecret = "segredo-de-sessao-compartilhado";
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));
    vi.stubEnv("JWT_SECRET", jwtSecret);

    // Monta um ciphertext no formato ANTIGO manualmente (mesma lógica que
    // o tokenCrypto.ts tinha antes do item B1b).
    const legacyKey = crypto.createHash("sha256").update(jwtSecret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", legacyKey, iv);
    const ciphertext = Buffer.concat([cipher.update("token-antigo", "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const legacyStored = [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { decryptToken } = await import("./tokenCrypto");
    expect(decryptToken(legacyStored)).toBe("token-antigo");
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("formato legado"));
    consoleWarnSpy.mockRestore();
  });

  it("uma chave nova não decifra um ciphertext v2: cifrado com OUTRA chave", async () => {
    const crypto = await import("crypto");
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));
    vi.stubEnv("JWT_SECRET", "segredo-de-sessao");
    const { encryptToken } = await import("./tokenCrypto");
    const stored = encryptToken("segredo");

    vi.unstubAllEnvs();
    vi.resetModules();
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));
    vi.stubEnv("JWT_SECRET", "segredo-de-sessao");
    const { decryptToken } = await import("./tokenCrypto");

    expect(() => decryptToken(stored)).toThrow();
  });
});
