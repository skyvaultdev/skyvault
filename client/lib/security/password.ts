import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// scrypt nativo do Node — evita adicionar bcrypt como dependência só pra
// isso. Usado só pro login de devs (nenhum outro fluxo de auth do app usa
// senha — Discord/Google/email são todos sem senha).
const KEY_LENGTH = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, derivedHex] = stored.split(":");
  if (!salt || !derivedHex) return false;

  const derived = scryptSync(plain, salt, KEY_LENGTH);
  const stored_ = Buffer.from(derivedHex, "hex");
  if (derived.length !== stored_.length) return false;

  return timingSafeEqual(derived, stored_);
}
