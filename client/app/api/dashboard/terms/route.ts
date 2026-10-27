"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { requirePermission } from "@/lib/auth/guard";
import { config } from "@/config/configuration";
import { PLATFORM_TERMS_VERSION } from "@/lib/legal/platformTerms";

// Só o owner precisa aceitar o contrato da plataforma (é ele quem
// contrata o serviço) — admin/editor não veem esse gate. Se a versão
// salva em store_settings não bate com PLATFORM_TERMS_VERSION (nunca
// aceitou, ou o contrato mudou desde o último aceite), needsAcceptance
// vira true e o dashboard mostra o gate de novo.
export async function GET() {
  try {
    const { session, denied } = await requirePermission("dashboard.access");
    if (denied) return denied;

    const isOwner = session?.role === "owner";
    let needsAcceptance = false;

    if (isOwner) {
      const db = getDB();
      const result = await db.query(
        `SELECT platform_terms_version FROM store_settings ORDER BY id DESC LIMIT 1`
      );
      const acceptedVersion = result.rows[0]?.platform_terms_version ?? null;
      needsAcceptance = acceptedVersion !== PLATFORM_TERMS_VERSION;
    }

    return ok({
      needsAcceptance,
      termsVersion: PLATFORM_TERMS_VERSION,
      platformName: config.platform.legalName,
      platformContactEmail: config.platform.contactEmail,
    });
  } catch (error) {
    console.error("GET /api/dashboard/terms error:", error);
    return fail("INTERNAL_ERROR", 500);
  }
}

export async function POST() {
  try {
    const { session, denied } = await requirePermission("dashboard.access");
    if (denied) return denied;

    if (session?.role !== "owner") {
      return fail("ONLY_OWNER_CAN_ACCEPT", 403);
    }

    const db = getDB();
    const current = await db.query(`SELECT id FROM store_settings ORDER BY id DESC LIMIT 1`);
    const row = current.rows[0];
    if (!row) return fail("STORE_SETTINGS_NOT_FOUND", 404);

    await db.query(
      `UPDATE store_settings
       SET platform_terms_accepted_at = NOW(), platform_terms_version = $1, platform_terms_accepted_by = $2
       WHERE id = $3`,
      [PLATFORM_TERMS_VERSION, session.email, row.id]
    );

    return ok({ accepted: true });
  } catch (error) {
    console.error("POST /api/dashboard/terms error:", error);
    return fail("INTERNAL_ERROR", 500);
  }
}
