import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import crypto from "crypto";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { signJWT, verifyJWT } from "@/lib/jwt/init";

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
const SECRET = "KRSXG5CTMVRXEZLUKN2XAZLSKZ2FKZDT";

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
  const email = `teste-2fa-verify-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.com`;
  await getDB().query(
    `INSERT INTO admin (email, role, totp_secret, totp_enabled) VALUES ($1, 'editor', $2, true)`,
    [email, SECRET]
  );
  return email;
}

function verifyRequest(code: string) {
  return new Request("https://example.com/api/auth/2fa/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

function getSetCookieValue(res: Response): string | undefined {
  const raw = res.headers.get("set-cookie");
  if (!raw) return undefined;
  const match = raw.match(/auth_token=([^;]+)/);
  return match?.[1];
}

describe("POST /api/auth/2fa/verify", () => {
  it("com um código válido, reassina o auth_token com twoFaVerifiedAt preenchido", async () => {
    const email = await createEnabledAdmin("ok");
    try {
      cookieValue = await signJWT({ email, sid: 1, role: "editor", permissions: ["dashboard.access"] });
      const res = await POST(verifyRequest(codeFor(SECRET)));
      const json = await res.json();
      expect(json.ok).toBe(true);

      const newToken = getSetCookieValue(res);
      expect(newToken).toBeTruthy();
      const decoded = await verifyJWT(decodeURIComponent(newToken!));
      expect(decoded?.email).toBe(email);
      expect(typeof decoded?.twoFaVerifiedAt).toBe("number");
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });

  it("recusa um código errado e não emite novo cookie", async () => {
    const email = await createEnabledAdmin("wrong-code");
    try {
      cookieValue = await signJWT({ email, sid: 1, role: "editor", permissions: ["dashboard.access"] });
      const res = await POST(verifyRequest("000000"));
      expect(res.status).toBe(400);
      expect(res.headers.get("set-cookie")).toBeNull();
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });

  it("recusa sem sessão (sem cookie auth_token)", async () => {
    const res = await POST(verifyRequest("123456"));
    expect(res.status).toBe(401);
  });

  it("recusa quando a conta não tem 2FA ligado", async () => {
    const email = `teste-2fa-verify-notenabled-${Date.now()}@teste.com`;
    await getDB().query(`INSERT INTO admin (email, role) VALUES ($1, 'editor')`, [email]);
    try {
      cookieValue = await signJWT({ email, sid: 1, role: "editor", permissions: ["dashboard.access"] });
      const res = await POST(verifyRequest("123456"));
      expect(res.status).toBe(400);
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });

  it("recusa reenvio do MESMO código já aceito (replay) mesmo ainda dentro da janela de tolerância", async () => {
    const email = await createEnabledAdmin("replay");
    try {
      cookieValue = await signJWT({ email, sid: 1, role: "editor", permissions: ["dashboard.access"] });
      const code = codeFor(SECRET);

      const first = await POST(verifyRequest(code));
      expect((await first.json()).ok).toBe(true);

      const second = await POST(verifyRequest(code));
      const secondJson = await second.json();
      expect(second.status).toBe(400);
      expect(secondJson.error).toBe("CODE_ALREADY_USED");
      expect(second.headers.get("set-cookie")).toBeNull();
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });

  it("devolve 429 com Retry-After depois de estourar o limite de tentativas", async () => {
    const email = await createEnabledAdmin("ratelimit");
    try {
      cookieValue = await signJWT({ email, sid: 1, role: "editor", permissions: ["dashboard.access"] });

      let last: Response | undefined;
      for (let i = 0; i < 6; i++) {
        last = await POST(verifyRequest("000000"));
      }
      expect(last!.status).toBe(429);
      expect((await last!.json()).error).toBe("TOO_MANY_REQUESTS");
      expect(last!.headers.get("Retry-After")).toBe("300");
    } finally {
      await getDB().query(`DELETE FROM admin WHERE email = $1`, [email]);
    }
  });
});
