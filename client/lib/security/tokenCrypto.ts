import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { config } from "@/config/configuration";

// Criptografia em repouso de credenciais de integração (hoje só
// melhor_envio_credentials.access_token_encrypted). Chave própria
// (INTEGRATION_ENCRYPTION_KEY), não mais derivada de JWT_SECRET — ver
// comentário em config/configuration.ts sobre por quê.
//
// Formato novo: "v2:<iv>:<tag>:<ciphertext>". O prefixo de versão permite
// trocar a chave de novo no futuro sem quebrar leitura do que já foi
// gravado — só adicionar "v3" ao lado de "v2" quando chegar a hora.
const VERSION_PREFIX = "v2";

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = config.integration.encryptionKey;
  if (!raw) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY não configurada — obrigatória pra cifrar/decifrar credenciais de integração. " +
      "Gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`INTEGRATION_ENCRYPTION_KEY inválida — esperado 32 bytes em base64, recebido ${key.length} byte(s).`);
  }

  cachedKey = key;
  return cachedKey;
}

// Fallback TEMPORÁRIO de leitura — só pra ciphertext no formato antigo
// (sem prefixo "v2:", 3 campos: iv:tag:ciphertext), cifrado com
// sha256(JWT_SECRET). Existe só pra não quebrar credenciais já salvas
// enquanto scripts/migrations/reencryptIntegrationTokens.js não roda em
// cada ambiente.
// TODO(remover): depois que a migração confirmar 100% das linhas
// migradas em produção, apagar legacyKey e o branch de fallback abaixo.
const legacyKey = createHash("sha256").update(config.jwt.secret).digest();

export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION_PREFIX, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptToken(encrypted: string): string {
  const parts = encrypted.split(":");

  if (parts[0] === VERSION_PREFIX && parts.length === 4) {
    const [, ivB64, authTagB64, ciphertextB64] = parts;
    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
  }

  // Formato antigo (3 campos, sem prefixo de versão) — fallback temporário,
  // ver TODO acima de legacyKey.
  console.warn("tokenCrypto: decifrando ciphertext em formato legado (sem prefixo v2:) — rode scripts/migrations/reencryptIntegrationTokens.js.");
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", legacyKey, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
}
