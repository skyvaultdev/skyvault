"use server";

import { getDB, withTransaction } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { generateUniqueReferralCode } from "@/lib/resellers/referralCode";
import { createNotification } from "@/lib/notifications/createNotification";
import { ensureNotificationsTable } from "@/lib/notifications/ensureNotificationsTable";

// Revendedor não se candidata mais — o owner convida um cliente já
// cadastrado (por email), e o convite aparece na aba de notificações dele
// pra aceitar ou recusar (app/api/notifications/[id]/route.ts). Reusa a
// mesma linha em `resellers` se a pessoa já tinha sido convidada antes
// (rejeitada/suspensa) — user_id é UNIQUE lá, então não dá pra inserir
// uma segunda vez.
export async function POST(req: Request) {
  try {
    const { denied } = await requirePermission("resellers.manage");
    if (denied) return denied;

    await ensureNotificationsTable();
    const db = getDB();

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) return fail("INVALID_EMAIL", 400);

    const userRes = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (userRes.rows.length === 0) return fail("USER_NOT_FOUND", 404);
    const userId = userRes.rows[0].id;

    const existing = await db.query(`SELECT id, status FROM resellers WHERE user_id = $1`, [userId]);
    if (existing.rows.length > 0 && ["invited", "approved"].includes(existing.rows[0].status)) {
      return fail("ALREADY_RESELLER_OR_INVITED", 409);
    }

    const { resellerId } = await withTransaction(async (client) => {
      let id: number;
      if (existing.rows.length > 0) {
        id = existing.rows[0].id;
        await client.query(`UPDATE resellers SET status = 'invited', note = NULL WHERE id = $1`, [id]);
      } else {
        const code = await generateUniqueReferralCode(client);
        const inserted = await client.query(
          `INSERT INTO resellers (user_id, referral_code, status) VALUES ($1, $2, 'invited') RETURNING id`,
          [userId, code]
        );
        id = inserted.rows[0].id;
      }

      await createNotification(client, {
        userId,
        type: "reseller_invite",
        title: "Convite pra ser revendedor",
        body: "A loja te convidou pra fazer parte do programa de revendedores. Aceite pra escolher produtos e gerar seus links de divulgação.",
        data: { resellerId: id },
      });

      return { resellerId: id };
    });

    return ok({ invited: true, resellerId }, 201);
  } catch (error) {
    console.error("Erro ao convidar revendedor:", error);
    return fail("RESELLER_INVITE_ERROR", 500);
  }
}
