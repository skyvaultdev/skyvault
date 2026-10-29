#!/usr/bin/env node
// =====================================================================
// Migração: recifra melhor_envio_credentials.access_token_encrypted da
// chave antiga (sha256(JWT_SECRET)) pra INTEGRATION_ENCRYPTION_KEY (env),
// que é onde lib/security/tokenCrypto.ts lê a chave desde o item B1b.
//
// Formato antigo: "iv:tag:ciphertext" (3 campos, sem prefixo).
// Formato novo:   "v2:iv:tag:ciphertext" (4 campos).
//
// lib/security/tokenCrypto.ts já tem um fallback temporário que lê o
// formato antigo automaticamente (com sha256(JWT_SECRET)) — rodar este
// script não é estritamente bloqueante pra o app funcionar, mas remove a
// dependência de JWT_SECRET pra decifrar essa credencial, e é pré-
// requisito pra remover o fallback (ver TODO em tokenCrypto.ts).
//
// Idempotente: rodar duas vezes é seguro. Linhas já no formato novo são
// puladas, não recifradas de novo.
//
// Uso:
//   node scripts/migrations/reencryptIntegrationTokens.js --dry-run
//   node scripts/migrations/reencryptIntegrationTokens.js
//
// Pré-requisitos: INTEGRATION_ENCRYPTION_KEY e JWT_SECRET já configurados
// no ambiente (mesmas variáveis que o app usa — ver .env.example).
// =====================================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

(function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "..", "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
})();

const DRY_RUN = process.argv.includes("--dry-run");
const VERSION_PREFIX = "v2";

function decryptLegacy(stored, key) {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

function decryptV2(stored, key) {
  const [, ivB64, tagB64, dataB64] = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

function encryptV2(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION_PREFIX}:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

async function main() {
  const newKeyRaw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!newKeyRaw) {
    console.error("ERRO: INTEGRATION_ENCRYPTION_KEY não configurada no ambiente. Abortando.");
    process.exit(1);
  }
  const newKey = Buffer.from(newKeyRaw, "base64");
  if (newKey.length !== 32) {
    console.error(`ERRO: INTEGRATION_ENCRYPTION_KEY inválida — esperado 32 bytes, recebido ${newKey.length}.`);
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    console.error("ERRO: JWT_SECRET não configurada — necessária pra decifrar o formato antigo. Abortando.");
    process.exit(1);
  }
  const legacyKey = crypto.createHash("sha256").update(process.env.JWT_SECRET).digest();

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const client = await pool.connect();

  console.log(DRY_RUN ? "=== DRY RUN — nada será gravado ===" : "=== Aplicando migração ===");

  const totals = { migrated: 0, alreadyMigrated: 0, needsReview: 0, empty: 0 };

  try {
    const stores = await client.query("SELECT id, slug FROM stores ORDER BY id");

    for (const store of stores.rows) {
      await client.query("SELECT set_config('app.store_id', $1, false)", [String(store.id)]);

      const rows = await client.query(
        "SELECT id, access_token_encrypted FROM melhor_envio_credentials WHERE store_id = $1",
        [store.id]
      );

      for (const row of rows.rows) {
        if (!row.access_token_encrypted) {
          totals.empty++;
          continue;
        }

        const parts = row.access_token_encrypted.split(":");
        if (parts[0] === VERSION_PREFIX && parts.length === 4) {
          try {
            decryptV2(row.access_token_encrypted, newKey);
            totals.alreadyMigrated++;
            console.log(`loja ${store.id} (${store.slug}), credencial id=${row.id}: já no formato novo — pulada.`);
          } catch {
            totals.needsReview++;
            console.warn(`loja ${store.id} (${store.slug}), credencial id=${row.id}: tem prefixo v2: mas não decifra com a chave nova — PRECISA DE REVISÃO MANUAL.`);
          }
          continue;
        }

        try {
          const plaintext = decryptLegacy(row.access_token_encrypted, legacyKey);
          totals.migrated++;
          console.log(`loja ${store.id} (${store.slug}), credencial id=${row.id}: recifrada.`);
          if (!DRY_RUN) {
            const reencrypted = encryptV2(plaintext, newKey);
            await client.query("UPDATE melhor_envio_credentials SET access_token_encrypted = $1 WHERE id = $2", [
              reencrypted,
              row.id,
            ]);
          }
        } catch {
          totals.needsReview++;
          console.warn(`loja ${store.id} (${store.slug}), credencial id=${row.id}: não decifrou no formato antigo nem no novo — PRECISA DE REVISÃO MANUAL, não tocada.`);
        }
      }
    }

    console.log("--- RESUMO ---");
    console.log(totals);

    if (DRY_RUN) {
      console.log("(dry-run: nada foi gravado)");
    }
    if (totals.needsReview > 0) {
      console.error(`ATENÇÃO: ${totals.needsReview} credencial(is) precisam de revisão manual.`);
      process.exitCode = 2;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha na migração:", err);
  process.exit(1);
});
