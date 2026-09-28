import { getDB } from "@/lib/database/db";
import { DEFAULT_CONFIG, sanitizeConfig, type HomeConfig } from "@/lib/home/config";

export async function ensureHomeConfigColumn() {
  await getDB().query(`ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS home_config JSONB`);
}

// Home sem configuração salva = template "Clássico", idêntico ao que já
// existia — quem nunca abriu a aba de templates não vê mudança nenhuma.
export async function loadHomeConfig(): Promise<HomeConfig> {
  try {
    await ensureHomeConfigColumn();
    const res = await getDB().query(`SELECT home_config FROM store_settings ORDER BY id DESC LIMIT 1`);
    const saved = sanitizeConfig(res.rows[0]?.home_config);
    return saved && saved.sections.length > 0 ? saved : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}
