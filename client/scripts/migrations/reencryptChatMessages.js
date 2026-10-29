#!/usr/bin/env node
// =====================================================================
// Migração: recifra chat_messages.body da chave antiga (gerada e
// guardada em store_settings.chat_encryption_key, até o commit de4d5eb)
// pra CHAT_ENCRYPTION_KEY (env), que é onde lib/chat/messageCrypto.ts lê
// a chave desde então.
//
// Por que existe: nenhuma mensagem cifrada com a chave antiga foi
// encontrada no banco de dev usado nesta sessão (0 linhas, chave nunca
// chegou a ser gerada) — mas isso não garante o mesmo em produção. Este
// script é a rede de segurança: se existir alguma mensagem na chave
// antiga em QUALQUER ambiente, ela é migrada; se não existir nenhuma
// (como no dev), o script roda e não faz nada, sem erro.
//
// Idempotente: rodar duas vezes é seguro. Mensagens já migradas (que já
// decifram com CHAT_ENCRYPTION_KEY) são puladas, não recifradas de novo.
//
// Uso:
//   node scripts/migrations/reencryptChatMessages.js --dry-run   # só conta, não grava
//   node scripts/migrations/reencryptChatMessages.js             # aplica de verdade
//
// Pré-requisito: CHAT_ENCRYPTION_KEY já configurada no ambiente (mesma
// variável que o app usa — ver .env.example).
// =====================================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

// Carregador mínimo de .env.local — mesmo approach de vitest.setup.ts,
// sem depender do pacote "dotenv" (não é uma dependência direta deste
// projeto, só transitiva via Next.js). "Primeira ocorrência vence",
// nunca sobrescreve uma env var já setada pelo processo que chamou isto.
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

function decryptEnc1(stored, key) {
  const [prefix, ivB64, tagB64, dataB64] = stored.split(":");
  if (prefix !== "enc1") throw new Error("formato inesperado");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

function encryptEnc1(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc1:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

async function main() {
  const newKeyRaw = process.env.CHAT_ENCRYPTION_KEY;
  if (!newKeyRaw) {
    console.error("ERRO: CHAT_ENCRYPTION_KEY não configurada no ambiente. Abortando.");
    process.exit(1);
  }
  const newKey = Buffer.from(newKeyRaw, "base64");
  if (newKey.length !== 32) {
    console.error(`ERRO: CHAT_ENCRYPTION_KEY inválida — esperado 32 bytes, recebido ${newKey.length}.`);
    process.exit(1);
  }

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const client = await pool.connect();

  console.log(DRY_RUN ? "=== DRY RUN — nada será gravado ===" : "=== Aplicando migração ===");

  const totals = { migrated: 0, alreadyMigrated: 0, needsReview: 0, storesWithoutOldKey: 0 };
  const storesToClearKey = [];

  try {
    const stores = await client.query("SELECT id, slug FROM stores ORDER BY id");

    for (const store of stores.rows) {
      await client.query("SELECT set_config('app.store_id', $1, false)", [String(store.id)]);

      const settingsRes = await client.query(
        "SELECT chat_encryption_key FROM store_settings WHERE store_id = $1",
        [store.id]
      );
      const oldKeyRaw = settingsRes.rows[0]?.chat_encryption_key;
      if (!oldKeyRaw) {
        totals.storesWithoutOldKey++;
        console.log(`loja ${store.id} (${store.slug}): sem chave antiga — nada a migrar.`);
        continue;
      }
      const oldKey = Buffer.from(oldKeyRaw, "base64");

      const msgsRes = await client.query(
        "SELECT id, body FROM chat_messages WHERE body LIKE 'enc1:%'"
      );

      let storeMigrated = 0;
      let storeAlready = 0;
      let storeFailed = 0;

      for (const msg of msgsRes.rows) {
        let plaintext;
        try {
          plaintext = decryptEnc1(msg.body, oldKey);
        } catch {
          // Não decifrou com a chave antiga — ou já foi migrada (tenta
          // com a nova), ou está corrompida.
          try {
            decryptEnc1(msg.body, newKey);
            storeAlready++;
            continue;
          } catch {
            storeFailed++;
            console.warn(`  chat_messages.id=${msg.id}: não decifrou nem com a chave antiga nem com a nova — PRECISA DE REVISÃO MANUAL, não tocado.`);
            continue;
          }
        }

        storeMigrated++;
        if (!DRY_RUN) {
          const reencrypted = encryptEnc1(plaintext, newKey);
          await client.query("UPDATE chat_messages SET body = $1 WHERE id = $2", [reencrypted, msg.id]);
        }
      }

      console.log(
        `loja ${store.id} (${store.slug}): ${storeMigrated} recifrada(s), ${storeAlready} já migrada(s), ${storeFailed} precisando de revisão.`
      );

      totals.migrated += storeMigrated;
      totals.alreadyMigrated += storeAlready;
      totals.needsReview += storeFailed;

      if (storeFailed === 0) storesToClearKey.push(store.id);
    }

    console.log("--- RESUMO ---");
    console.log(totals);

    if (!DRY_RUN && storesToClearKey.length > 0) {
      for (const storeId of storesToClearKey) {
        await client.query("SELECT set_config('app.store_id', $1, false)", [String(storeId)]);
        await client.query("UPDATE store_settings SET chat_encryption_key = NULL WHERE store_id = $1", [storeId]);
      }
      console.log(`chat_encryption_key zerada em store_settings pra ${storesToClearKey.length} loja(s) sem pendência.`);
    } else if (DRY_RUN) {
      console.log("(dry-run: chat_encryption_key NÃO foi zerada em nenhuma loja)");
    }

    if (totals.needsReview > 0) {
      console.error(`ATENÇÃO: ${totals.needsReview} mensagem(ns) precisam de revisão manual — chat_encryption_key NÃO foi zerada nas lojas afetadas.`);
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
