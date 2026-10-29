import crypto from "crypto";
import { config } from "@/config/configuration";

// Criptografia em repouso do conteúdo das mensagens (chat_messages.body) —
// não é E2E (Signal Protocol de verdade faria staff não conseguir mais ler
// os tickets de suporte, o que quebraria o atendimento). O objetivo aqui é
// mais estreito: quem tiver acesso direto ao banco (um dump vazado, um
// acesso indevido) não lê o conteúdo das conversas — o servidor ainda
// decifra normalmente pra exibir na tela, pro cliente e pro staff.
//
// A chave vem só de CHAT_ENCRYPTION_KEY (env) — ANTES vivia em
// store_settings, no MESMO banco que guarda o conteúdo cifrado, o que
// anulava a proteção (um dump do banco trazia os dois juntos). Nunca é
// gerada/persistida pelo app, e NÃO tem fallback gerado por boot (ao
// contrário de devAuth.secret): perder ou trocar esse valor torna toda
// mensagem já gravada permanentemente ilegível, isso não é um segredo de
// sessão que pode rotacionar sem problema.
let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = config.chat.encryptionKey;
  if (!raw) {
    throw new Error(
      "CHAT_ENCRYPTION_KEY não configurada — obrigatória pra cifrar/decifrar chat_messages.body. " +
      "Gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`CHAT_ENCRYPTION_KEY inválida — esperado 32 bytes em base64, recebido ${key.length} byte(s).`);
  }

  cachedKey = key;
  return cachedKey;
}

const FORMAT_PREFIX = "enc1";

export async function encryptChatBody(plaintext: string): Promise<string> {
  const key = getEncryptionKey();
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
    const key = getEncryptionKey();
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
