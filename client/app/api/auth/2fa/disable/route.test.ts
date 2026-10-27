import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import crypto from "crypto";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { signJWT } from "@/lib/jwt/init";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "auth_token" && cookieValue ? { value: cookieValue } : undefined) }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

const { POST } = await import("./route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

afterEach(() => {
  cookieValue = undefined;
});

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SECRET = "KRSXG5CTMVRXEZLUKN2XAZLSKZ2FKZDT"; // qualquer base32 válido fixo, só para os testes

function codeFor(secret: string): string {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
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
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", Buffer.from(bytes)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** 6).padStart(6, "0");
}

async function createEnabledAdmin(tag: string) {
  const email = `teste-2fa-disable-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;
  await getDB().query(
    `INSERT INTO admin (email, role, totp_secret, totp_enabled) VALUES ($1, 'editor', $2, true)`,
    [email, SECRET]
  );
  return email;
}

function disableRequest(code: string) {
  return new Request("https://example.com/api/auth/2fa/disable", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

describe("POST /api/auth/2fa/disable", () => {
  it("desliga o 2FA quando o código atual é válido", async () => {
    const email = await createEnabledAdmin("ok");
    try {
      cookieValue = await signJWT({ email, sid: 1, permissions: ["dashboard.access"] });
      const res = await POST(disableRequest(codeFor(SECRET)));
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.enabled).toBe(false);

      const row = await getDB().query(`SELECT totp_enabled, totp_secret FROM admin WHERE email = $1`, [email]);
      expect(row.rows[0].totp_enabled).toBe(false);
      expect(row.rows[0].totp_secret).toBeNull();
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });

  it("recusa com um código errado e mantém o 2FA ligado", async () => {
    const email = await createEnabledAdmin("wrong-code");
    try {
      cookieValue = await signJWT({ email, sid: 1, permissions: ["dashboard.access"] });
      const res = await POST(disableRequest("000000"));
      expect(res.status).toBe(400);

      const row = await getDB().query(`SELECT totp_enabled FROM admin WHERE email = $1`, [email]);
      expect(row.rows[0].totp_enabled).toBe(true);
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });

  it("recusa quando o 2FA já está desligado", async () => {
    const email = `teste-2fa-disable-notenabled-${Date.now()}@teste.com`;
    await getDB().query(`INSERT INTO admin (email, role) VALUES ($1, 'editor')`, [email]);
    try {
      cookieValue = await signJWT({ email, sid: 1, permissions: ["dashboard.access"] });
      const res = await POST(disableRequest("123456"));
      expect(res.status).toBe(400);
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });

  it("devolve 429 com Retry-After depois de estourar o limite de tentativas", async () => {
    const email = await createEnabledAdmin("ratelimit");
    try {
      cookieValue = await signJWT({ email, sid: 1, permissions: ["dashboard.access"] });

      let last: Response | undefined;
      for (let i = 0; i < 6; i++) {
        last = await POST(disableRequest("000000"));
      }
      expect(last!.status).toBe(429);
      expect(last!.headers.get("Retry-After")).toBe("300");
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });
});
