import { describe, it, expect, vi, afterEach } from "vitest";

describe("lib/chat/messageCrypto — chave vem só de CHAT_ENCRYPTION_KEY (env)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("cifra e decifra uma mensagem, roundtrip correto", async () => {
    const crypto = await import("crypto");
    vi.stubEnv("CHAT_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));

    const { encryptChatBody, decryptChatBody } = await import("./messageCrypto");
    const stored = await encryptChatBody("Olá, preciso de ajuda com meu pedido");
    expect(stored.startsWith("enc1:")).toBe(true);
    expect(stored).not.toContain("preciso de ajuda");

    const plaintext = await decryptChatBody(stored);
    expect(plaintext).toBe("Olá, preciso de ajuda com meu pedido");
  });

  it("devolve mensagens antigas (sem prefixo enc1:) como estão, sem tentar decifrar", async () => {
    const crypto = await import("crypto");
    vi.stubEnv("CHAT_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));

    const { decryptChatBody } = await import("./messageCrypto");
    expect(await decryptChatBody("mensagem em texto puro, de antes da feature")).toBe(
      "mensagem em texto puro, de antes da feature"
    );
    expect(await decryptChatBody(null)).toBe("");
  });

  it("lança erro claro ao cifrar sem CHAT_ENCRYPTION_KEY configurada (fail closed)", async () => {
    vi.stubEnv("CHAT_ENCRYPTION_KEY", "");

    const { encryptChatBody } = await import("./messageCrypto");
    await expect(encryptChatBody("qualquer coisa")).rejects.toThrow(/CHAT_ENCRYPTION_KEY não configurada/);
  });

  it("lança erro claro com uma chave de tamanho errado", async () => {
    vi.stubEnv("CHAT_ENCRYPTION_KEY", Buffer.from("chave-curta-demais").toString("base64"));

    const { encryptChatBody } = await import("./messageCrypto");
    await expect(encryptChatBody("qualquer coisa")).rejects.toThrow(/CHAT_ENCRYPTION_KEY inválida/);
  });

  it("duas chaves diferentes nunca decifram a mensagem uma da outra", async () => {
    const crypto = await import("crypto");

    vi.stubEnv("CHAT_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));
    const { encryptChatBody } = await import("./messageCrypto");
    const stored = await encryptChatBody("segredo do cliente");

    vi.unstubAllEnvs();
    vi.resetModules();
    vi.stubEnv("CHAT_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));
    const { decryptChatBody } = await import("./messageCrypto");

    expect(await decryptChatBody(stored)).toBe("[mensagem não pôde ser decifrada]");
  });
});
