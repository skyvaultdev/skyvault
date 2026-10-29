import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import crypto from "crypto";
import path from "path";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";

// Mesmo padrão de scripts/migrations/reencryptChatMessages.test.ts: spawna
// o script como processo separado, contra o banco de dev real. A tabela
// melhor_envio_credentials tem UNIQUE(store_id) — só existe 1 linha por
// loja — então o teste toma emprestada a linha real da loja 1 por um
// instante (valor original salvo e restaurado no afterAll), em vez de
// inserir uma linha sintética.

const SCRIPT_PATH = path.resolve(__dirname, "reencryptIntegrationTokens.js");

function runScript(extraArgs: string[] = []) {
  try {
    const out = execFileSync("node", [SCRIPT_PATH, ...extraArgs], { encoding: "utf8", env: process.env });
    return { out, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { out: e.stdout ?? "", exitCode: e.status ?? 1 };
  }
}

function encryptLegacy(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

describe("scripts/migrations/reencryptIntegrationTokens — recifra melhor_envio_credentials da chave antiga (sha256(JWT_SECRET)) pra INTEGRATION_ENCRYPTION_KEY", () => {
  const plaintext = `token-de-teste-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let originalValue: string | null = null;
  let rowExisted = false;

  beforeAll(async () => {
    await initApp();
    const db = getDB();

    const row = await db.query("SELECT id, access_token_encrypted FROM melhor_envio_credentials WHERE store_id = 1");
    rowExisted = row.rows.length > 0;
    originalValue = row.rows[0]?.access_token_encrypted ?? null;

    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET precisa estar configurada pra este teste rodar.");
    const legacyKey = crypto.createHash("sha256").update(process.env.JWT_SECRET).digest();
    const legacyCiphertext = encryptLegacy(plaintext, legacyKey);

    if (rowExisted) {
      await db.query("UPDATE melhor_envio_credentials SET access_token_encrypted = $1 WHERE store_id = 1", [
        legacyCiphertext,
      ]);
    } else {
      await db.query("INSERT INTO melhor_envio_credentials (access_token_encrypted, sandbox) VALUES ($1, true)", [
        legacyCiphertext,
      ]);
    }
  });

  afterAll(async () => {
    const db = getDB();
    if (rowExisted) {
      await db.query("UPDATE melhor_envio_credentials SET access_token_encrypted = $1 WHERE store_id = 1", [
        originalValue,
      ]).catch(() => {});
    } else {
      await db.query("DELETE FROM melhor_envio_credentials WHERE store_id = 1").catch(() => {});
    }
    await (db as unknown as { end: () => Promise<void> }).end();
  });

  it("dry-run reporta 1 recifrada, mas NÃO altera o banco", async () => {
    const { out, exitCode } = runScript(["--dry-run"]);
    expect(exitCode).toBe(0);
    expect(out).toMatch(/1.*recifrada|recifrada: 1|migrated: 1/i);

    const db = getDB();
    const row = await db.query("SELECT access_token_encrypted FROM melhor_envio_credentials WHERE store_id = 1");
    expect(row.rows[0].access_token_encrypted.startsWith("v2:")).toBe(false);
  });

  it("rodando de verdade: recifra com INTEGRATION_ENCRYPTION_KEY, prefixo v2:", async () => {
    const { exitCode } = runScript([]);
    expect(exitCode).toBe(0);

    const db = getDB();
    const row = await db.query("SELECT access_token_encrypted FROM melhor_envio_credentials WHERE store_id = 1");
    expect(row.rows[0].access_token_encrypted.startsWith("v2:")).toBe(true);

    const newKey = Buffer.from(process.env.INTEGRATION_ENCRYPTION_KEY as string, "base64");
    const [, ivB64, tagB64, dataB64] = row.rows[0].access_token_encrypted.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", newKey, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
    expect(decrypted).toBe(plaintext);
  });

  it("idempotente: rodar de novo não acha mais nada pra migrar", async () => {
    const { out, exitCode } = runScript([]);
    expect(exitCode).toBe(0);
    expect(out).toMatch(/já no formato novo/);
    expect(out).not.toMatch(/recifrada\.$/m);
  });
});
