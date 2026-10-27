import crypto from "crypto";

// TOTP (RFC 6238) feito à mão com o "crypto" do Node — não tem
// otplib/speakeasy nas dependências e isso é pequeno/estável o bastante
// (HMAC-SHA1, 30s, 6 dígitos) pra não valer a pena trazer uma lib nova só
// pra isso. Compatível com qualquer app autenticador padrão (Google
// Authenticator, Authy, 1Password, etc.) — mesmo algoritmo que eles usam.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function generateTotpSecret(): string {
  // 20 bytes = 160 bits, o tamanho recomendado pela RFC pra HMAC-SHA1.
  return base32Encode(crypto.randomBytes(20));
}

export function buildTotpUri(secret: string, accountLabel: string, issuer: string): string {
  const encodedLabel = encodeURIComponent(`${issuer}:${accountLabel}`);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

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
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
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
  return String(binCode % 10 ** DIGITS).padStart(DIGITS, "0");
}

// `window` = quantos passos de 30s pra cada lado aceitar, pra tolerar
// relógio do celular levemente dessincronizado — sem isso, um código
// "certo" falha com muita frequência na prática.
//
// Devolve o NÚMERO do passo que casou (não só true/false) pra quem chama
// poder recusar replay: guardar esse número e rejeitar qualquer código
// futuro cujo passo seja <= o último aceito (ver totp_last_step em
// app/api/auth/2fa/*). null = nenhum passo da janela casou.
export function verifyTotpStep(secret: string, code: string, window = 1): number | null {
  const cleanCode = code.replace(/\D/g, "");
  if (cleanCode.length !== DIGITS) return null;

  const secretBuffer = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const candidate = hotp(secretBuffer, counter + errorWindow);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(cleanCode))) {
      return counter + errorWindow;
    }
  }
  return null;
}

export function verifyTotpCode(secret: string, code: string, window = 1): boolean {
  return verifyTotpStep(secret, code, window) !== null;
}
