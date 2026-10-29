import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import crypto from "crypto";
import path from "path";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";

// Testa contra o banco de dev de verdade (mesmo padrão já usado em
// outros testes sensíveis a corrida/migração neste projeto) — spawna o
// script como processo separado, igual quem for rodar isso em produção
// faria, em vez de importar as funções internas.

const SCRIPT_PATH = path.resolve(__dirname, "reencryptChatMessages.js");

function runScript(extraArgs: string[] = []) {
  try {
    const out = execFileSync("node", [SCRIPT_PATH, ...extraArgs], {
      encoding: "utf8",
      env: process.env,
    });
    return { out, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { out: e.stdout ?? "", exitCode: e.status ?? 1 };
  }
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc1:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

describe("scripts/migrations/reencryptChatMessages — recifra da chave antiga (store_settings) pra CHAT_ENCRYPTION_KEY (env)", () => {
  const oldKey = crypto.randomBytes(32);
  const plaintext = `mensagem de teste — ${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let conversationId: number;
  let messageId: number;
  let originalChatKey: string | null = null;

  beforeAll(async () => {
    await initApp();
    const db = getDB();

    const settings = await db.query("SELECT store_id, chat_encryption_key FROM store_settings WHERE store_id = 1");
    originalChatKey = settings.rows[0]?.chat_encryption_key ?? null;
    // Pré-condição do teste: sem chave antiga, o script não tenta migrar
    // nada (comportamento já coberto no dry-run manual contra este mesmo
    // banco) — aqui simulamos o cenário COM chave antiga de propósito.
    await db.query("UPDATE store_settings SET chat_encryption_key = $1 WHERE store_id = 1", [
      oldKey.toString("base64"),
    ]);

    const conv = await db.query(
      `INSERT INTO chat_conversations (customer_email, status, last_message_at) VALUES ($1, 'open', now()) RETURNING id`,
      [`teste-migracao-${Date.now()}@example.com`]
    );
    conversationId = conv.rows[0].id;

    const cipherWithOldKey = encryptWithKey(plaintext, oldKey);
    const msg = await db.query(
      `INSERT INTO chat_messages (conversation_id, sender_type, sender_email, body) VALUES ($1, 'customer', $2, $3) RETURNING id`,
      [conversationId, "teste-migracao@example.com", cipherWithOldKey]
    );
    messageId = msg.rows[0].id;
  });

  afterAll(async () => {
    const db = getDB();
    await db.query("DELETE FROM chat_messages WHERE id = $1", [messageId]).catch(() => {});
    await db.query("DELETE FROM chat_conversations WHERE id = $1", [conversationId]).catch(() => {});
    await db.query("UPDATE store_settings SET chat_encryption_key = $1 WHERE store_id = 1", [originalChatKey]).catch(() => {});
    await (db as unknown as { end: () => Promise<void> }).end();
  });

  it("dry-run reporta 1 recifrada, mas NÃO altera o banco", async () => {
    const { out, exitCode } = runScript(["--dry-run"]);
    expect(exitCode).toBe(0);
    expect(out).toMatch(/1 recifrada/);

    const db = getDB();
    const row = await db.query("SELECT body FROM chat_messages WHERE id = $1", [messageId]);
    expect(row.rows[0].body.startsWith("enc1:")).toBe(true);
    // Ainda decifra com a chave ANTIGA — dry-run não gravou nada.
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      oldKey,
      Buffer.from(row.rows[0].body.split(":")[1], "base64")
    );
    decipher.setAuthTag(Buffer.from(row.rows[0].body.split(":")[2], "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(row.rows[0].body.split(":")[3], "base64")),
      decipher.final(),
    ]).toString("utf8");
    expect(decrypted).toBe(plaintext);
  });

  it("rodando de verdade: recifra com CHAT_ENCRYPTION_KEY e zera a chave antiga", async () => {
    const { out, exitCode } = runScript([]);
    expect(exitCode).toBe(0);
    expect(out).toMatch(/1 recifrada/);
    expect(out).toMatch(/zerada em store_settings/);

    const db = getDB();
    const row = await db.query("SELECT body FROM chat_messages WHERE id = $1", [messageId]);
    expect(row.rows[0].body.startsWith("enc1:")).toBe(true);
    // Não decifra mais com a chave antiga.
    expect(() => {
      const parts = row.rows[0].body.split(":");
      const decipher = crypto.createDecipheriv("aes-256-gcm", oldKey, Buffer.from(parts[1], "base64"));
      decipher.setAuthTag(Buffer.from(parts[2], "base64"));
      decipher.update(Buffer.from(parts[3], "base64"));
      decipher.final();
    }).toThrow();

    const settings = await db.query("SELECT chat_encryption_key FROM store_settings WHERE store_id = 1");
    expect(settings.rows[0].chat_encryption_key).toBeNull();
  });

  it("idempotente: rodar de novo não acha mais nada pra migrar (já está na chave nova)", async () => {
    const { out, exitCode } = runScript([]);
    expect(exitCode).toBe(0);
    expect(out).toMatch(/sem chave antiga — nada a migrar/);
    expect(out).not.toMatch(/1 recifrada/);
  });
});
