import crypto from "crypto";
import { getDB } from "@/lib/database/db";

// Criptografia em repouso do conteúdo das mensagens (chat_messages.body) —
// não é E2E (Signal Protocol de verdade faria staff não conseguir mais ler
// os tickets de suporte, o que quebraria o atendimento). O objetivo aqui é
// mais estreito: quem tiver acesso direto ao banco (um dump vazado, um
// acesso indevido) não lê o conteúdo das conversas — o servidor ainda
// decifra normalmente pra exibir na tela, pro cliente e pro staff.
//
// A chave é gerada UMA VEZ e persistida em store_settings (nunca
// regenerada por processo/boot, ao contrário do DEV_JWT_SECRET) — perder
// essa chave torna toda mensagem já gravada permanentemente ilegível, ISSO
// NÃO É como um segredo de sessão que pode rotacionar sem problema.
let cachedKey: Buffer | null = null;

async function getEncryptionKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  const db = getDB();
  await db.query(`ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS chat_encryption_key TEXT`);

  const res = await db.query(`SELECT id, chat_encryption_key FROM store_settings ORDER BY id DESC LIMIT 1`);
  const row = res.rows[0];
  if (!row) throw new Error("STORE_SETTINGS_NOT_FOUND — não dá pra gerar/ler a chave de criptografia do chat sem uma linha em store_settings.");

  if (row.chat_encryption_key) {
    cachedKey = Buffer.from(row.chat_encryption_key, "base64");
    return cachedKey;
  }

  // Corrida entre dois processos gerando ao mesmo tempo: só o primeiro
  // UPDATE (WHERE ... IS NULL) realmente grava — os dois releem depois pra
  // garantir que todo mundo usa a MESMA chave, nunca a que cada um gerou.
  const newKey = crypto.randomBytes(32).toString("base64");
  await db.query(
    `UPDATE store_settings SET chat_encryption_key = $1 WHERE id = $2 AND chat_encryption_key IS NULL`,
    [newKey, row.id]
  );
  const finalRes = await db.query(`SELECT chat_encryption_key FROM store_settings WHERE id = $1`, [row.id]);
  cachedKey = Buffer.from(finalRes.rows[0].chat_encryption_key, "base64");
  return cachedKey;
}

const FORMAT_PREFIX = "enc1";

export async function encryptChatBody(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${FORMAT_PREFIX}:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

// Mensagens gravadas ANTES dessa feature existir estão em texto puro, sem
// o prefixo "enc1:" — devolve como está em vez de tentar decifrar (senão
// todo histórico de chat anterior quebraria de uma vez).
export async function decryptChatBody(stored: string | null): Promise<string> {
  if (!stored) return "";
  if (!stored.startsWith(`${FORMAT_PREFIX}:`)) return stored;

  try {
    const [, ivB64, tagB64, dataB64] = stored.split(":");
    const key = await getEncryptionKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Falha ao decifrar mensagem de chat:", error);
    return "[mensagem não pôde ser decifrada]";
  }
}

export async function decryptChatRows<T extends { body: string | null }>(rows: T[]): Promise<T[]> {
  return Promise.all(rows.map(async (row) => ({ ...row, body: await decryptChatBody(row.body) })));
}
