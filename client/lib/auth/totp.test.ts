import { describe, it, expect, afterEach, vi } from "vitest";
import crypto from "crypto";
import { generateTotpSecret, buildTotpUri, verifyTotpCode } from "./totp";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// Reimplementação independente só pra gerar o secret base32 e os códigos
// esperados nos testes — não importa nada "interno" de totp.ts, senão o
// teste viraria só um espelho do código em vez de validar o comportamento.
function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** 6).padStart(6, "0");
}

// RFC 4226 Apêndice D: secret ASCII "12345678901234567890" e os HOTPs
// esperados pros contadores 0-9.
const RFC_SECRET_ASCII = "12345678901234567890";
const RFC_SECRET_B32 = base32Encode(Buffer.from(RFC_SECRET_ASCII, "ascii"));
const RFC_CODES = [
  "755224", "287082", "359152", "969429", "338314",
  "254676", "287922", "162583", "399871", "520489",
];

describe("generateTotpSecret", () => {
  it("gera um secret base32 (RFC4648) de 32 caracteres (160 bits)", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("gera secrets diferentes a cada chamada", () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe("buildTotpUri", () => {
  it("monta a URI otpauth:// no formato esperado por apps autenticadores", () => {
    const uri = buildTotpUri("ABCD1234", "dono@loja.com", "Minha Loja");
    expect(uri).toBe(
      "otpauth://totp/Minha%20Loja%3Adono%40loja.com?secret=ABCD1234&issuer=Minha%20Loja&digits=6&period=30"
    );
  });
});

describe("verifyTotpCode", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aceita o código RFC 4226 correto pro instante correspondente a cada contador", () => {
    RFC_CODES.forEach((expectedCode, counter) => {
      vi.useFakeTimers();
      vi.setSystemTime(counter * 30 * 1000);
      expect(verifyTotpCode(RFC_SECRET_B32, expectedCode, 0)).toBe(true);
      vi.useRealTimers();
    });
  });

  it("rejeita um código incorreto", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    expect(verifyTotpCode(RFC_SECRET_B32, "000000", 0)).toBe(false);
  });

  it("tolera dessincronia de relógio dentro da janela (±1 passo de 30s)", () => {
    const secret = generateTotpSecret();
    vi.useFakeTimers();
    vi.setSystemTime(100 * 30 * 1000); // contador 100

    // Código válido pro PRÓXIMO passo (contador 101) precisa passar com window=1...
    const nextStepCode = hotp(base32DecodeForTest(secret), 101);
    expect(verifyTotpCode(secret, nextStepCode, 1)).toBe(true);
    // ...mas falhar sem tolerância (window=0), já que o contador atual é 100.
    expect(verifyTotpCode(secret, nextStepCode, 0)).toBe(false);
  });

  it("rejeita um código fora da janela de tolerância (2 passos de distância)", () => {
    const secret = generateTotpSecret();
    vi.useFakeTimers();
    vi.setSystemTime(200 * 30 * 1000); // contador 200

    const farCode = hotp(base32DecodeForTest(secret), 202);
    expect(verifyTotpCode(secret, farCode, 1)).toBe(false);
  });

  it("rejeita códigos que não têm 6 dígitos", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    expect(verifyTotpCode(RFC_SECRET_B32, "12345", 0)).toBe(false);
    expect(verifyTotpCode(RFC_SECRET_B32, "", 0)).toBe(false);
  });
});

function base32DecodeForTest(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
