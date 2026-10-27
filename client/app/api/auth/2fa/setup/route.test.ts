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

const { GET, POST } = await import("./route");

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

function codeFor(secret: string): string {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** 6).padStart(6, "0");
}

async function createAdmin(tag: string) {
  const email = `teste-2fa-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;
  await getDB().query(`INSERT INTO admin (email, role) VALUES ($1, 'editor')`, [email]);
  return email;
}

describe("GET/POST /api/auth/2fa/setup", () => {
  it("GET inicia o setup: gera e salva um secret pendente, devolve a URI otpauth", async () => {
    const email = await createAdmin("get-pending");
    try {
      cookieValue = await signJWT({ email, sid: 1, permissions: ["dashboard.access"] });
      const res = await GET();
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.enabled).toBe(false);
      expect(json.data.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(json.data.uri).toContain("otpauth://totp/");

      const row = await getDB().query(`SELECT totp_secret, totp_enabled FROM admin WHERE email = $1`, [email]);
      expect(row.rows[0].totp_secret).toBe(json.data.secret);
      expect(row.rows[0].totp_enabled).toBe(false);
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });

  it("GET devolve enabled:true sem gerar novo secret quando já está ativado", async () => {
    const email = await createAdmin("get-already-enabled");
    try {
      await getDB().query(`UPDATE admin SET totp_secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', totp_enabled = true WHERE email = $1`, [email]);
      cookieValue = await signJWT({ email, sid: 1, permissions: ["dashboard.access"] });
      const res = await GET();
      const json = await res.json();
      expect(json.data).toEqual({ enabled: true });
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });

  it("GET recusa sem a permissão dashboard.access", async () => {
    cookieValue = await signJWT({ email: "sem-permissao-2fa@teste.com", sid: 1, permissions: [] });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("POST confirma o setup com um código válido e liga o totp_enabled", async () => {
    const email = await createAdmin("post-confirm");
    try {
      cookieValue = await signJWT({ email, sid: 1, permissions: ["dashboard.access"] });
      const setupRes = await GET();
      const setupJson = await setupRes.json();
      const code = codeFor(setupJson.data.secret);

      const res = await POST(new Request("https://example.com/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }));
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.enabled).toBe(true);

      const row = await getDB().query(`SELECT totp_enabled FROM admin WHERE email = $1`, [email]);
      expect(row.rows[0].totp_enabled).toBe(true);
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });

  it("POST recusa um código errado e mantém o 2FA desligado", async () => {
    const email = await createAdmin("post-wrong-code");
    try {
      cookieValue = await signJWT({ email, sid: 1, permissions: ["dashboard.access"] });
      await GET();

      const res = await POST(new Request("https://example.com/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "000000" }),
      }));
      expect(res.status).toBe(400);

      const row = await getDB().query(`SELECT totp_enabled FROM admin WHERE email = $1`, [email]);
      expect(row.rows[0].totp_enabled).toBe(false);
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });

  it("POST recusa reenvio do MESMO código já usado pra confirmar (replay)", async () => {
    const email = await createAdmin("post-replay");
    try {
      cookieValue = await signJWT({ email, sid: 1, permissions: ["dashboard.access"] });
      const setupRes = await GET();
      const setupJson = await setupRes.json();
      const code = codeFor(setupJson.data.secret);

      const confirmRequest = () => new Request("https://example.com/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const first = await POST(confirmRequest());
      expect((await first.json()).ok).toBe(true);

      const second = await POST(confirmRequest());
      const secondJson = await second.json();
      expect(second.status).toBe(400);
      expect(secondJson.error).toBe("CODE_ALREADY_USED");
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });

  it("POST devolve 429 com Retry-After depois de estourar o limite de tentativas", async () => {
    const email = await createAdmin("post-ratelimit");
    try {
      cookieValue = await signJWT({ email, sid: 1, permissions: ["dashboard.access"] });
      await GET();

      let last: Response | undefined;
      for (let i = 0; i < 6; i++) {
        last = await POST(new Request("https://example.com/api/auth/2fa/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "000000" }),
        }));
      }
      expect(last!.status).toBe(429);
      expect(last!.headers.get("Retry-After")).toBe("300");
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });
});
