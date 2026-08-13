"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireDev } from "@/lib/devAuth/guard";
import { registerEfibankWebhook } from "@/lib/payments/efibankProvider";
import { config } from "@/config/configuration";

export async function POST() {
  try {
    const { denied } = await requireDev();
    if (denied) return denied;

    const webhookUrl = `${config.WEBSITE_URL}/api/webhooks/efibank`;
    if (webhookUrl.startsWith("http://localhost")) {
      return fail("WEBHOOK_URL_NOT_PUBLIC", 400);
    }

    await registerEfibankWebhook(webhookUrl);

    const db = getDB();
    await db.query(
      `UPDATE efibank_credentials SET webhook_registered_at = NOW()
       WHERE id = (SELECT id FROM efibank_credentials ORDER BY id DESC LIMIT 1)`
    );

    return ok({ registered: true, webhookUrl });
  } catch (error) {
    console.error("Erro ao registrar webhook EfiBank:", error);
    return fail("WEBHOOK_REGISTER_ERROR", 500);
  }
}
