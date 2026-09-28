"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { loadHomeConfig, ensureHomeConfigColumn } from "@/lib/home/loadHomeConfig";
import { sanitizeConfig } from "@/lib/home/config";

export async function GET() {
  try {
    const { denied } = await requirePermission("store.customize");
    if (denied) return denied;
    return ok(await loadHomeConfig());
  } catch (error) {
    console.error("Erro ao ler config da home:", error);
    return fail("HOME_CONFIG_FETCH_ERROR", 500);
  }
}

export async function PUT(req: Request) {
  try {
    const { denied } = await requirePermission("store.customize");
    if (denied) return denied;

    const config = sanitizeConfig(await req.json());
    if (!config) return fail("INVALID_CONFIG", 400);

    await ensureHomeConfigColumn();
    const db = getDB();
    const res = await db.query(
      `UPDATE store_settings SET home_config = $1, updated_at = NOW() WHERE id = (SELECT id FROM store_settings ORDER BY id DESC LIMIT 1)`,
      [JSON.stringify(config)]
    );
    if (res.rowCount === 0) return fail("STORE_SETTINGS_NOT_FOUND", 404);
    return ok(config);
  } catch (error) {
    console.error("Erro ao salvar config da home:", error);
    return fail("HOME_CONFIG_SAVE_ERROR", 500);
  }
}
