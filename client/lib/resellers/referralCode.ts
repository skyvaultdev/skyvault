import crypto from "crypto";
import type { Pool, PoolClient } from "pg";

// Maiúsculas + minúsculas (sem 0/O/o/1/I/l, ainda fáceis de confundir mesmo
// misturando caixa) — código vai só em URL de link de divulgação, copiado
// via botão, nunca digitado à mão, então prioriza mais entropia (mais
// difícil de adivinhar/força bruta) em vez de ser curto.
const CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
const LENGTH = 14;

function randomReferralCode(): string {
  const bytes = crypto.randomBytes(LENGTH);
  let out = "";
  for (let i = 0; i < LENGTH; i++) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  return out;
}

export async function generateUniqueReferralCode(client: Pool | PoolClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomReferralCode();
    const existing = await client.query(`SELECT 1 FROM resellers WHERE referral_code = $1`, [candidate]);
    if (existing.rows.length === 0) return candidate;
  }
  throw new Error("REFERRAL_CODE_GENERATION_FAILED");
}
