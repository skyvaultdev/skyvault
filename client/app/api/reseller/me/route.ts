"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { ensureResellerTables } from "@/lib/resellers/ensureResellerTables";
import { config } from "@/config/configuration";

// Devolve o status de revendedor do cliente logado, mesmo que ainda não
// tenha se candidatado (nesse caso reseller: null) — a página de
// revendedor usa isso pra decidir entre mostrar o formulário de
// candidatura, um aviso de "aguardando aprovação" ou o painel completo.
export async function GET() {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    await ensureResellerTables();
    const db = getDB();

    const resellerRes = await db.query(`SELECT * FROM resellers WHERE user_id = $1`, [userId]);
    if (resellerRes.rows.length === 0) {
      return ok({ reseller: null });
    }
    const reseller = resellerRes.rows[0];

    if (reseller.status !== "approved") {
      return ok({ reseller: { status: reseller.status, note: reseller.note } });
    }

    const [productsRes, commissionsRes, payoutsRes] = await Promise.all([
      db.query(
        `SELECT rp.product_id, rp.commission_percent, p.name AS product_name, p.slug, p.price
         FROM reseller_products rp JOIN products p ON p.id = rp.product_id
         WHERE rp.reseller_id = $1 ORDER BY p.name ASC`,
        [reseller.id]
      ),
      db.query(
        `SELECT id, order_id, product_name, sale_amount, commission_percent, commission_amount, status, created_at, paid_at
         FROM reseller_commissions WHERE reseller_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [reseller.id]
      ),
      db.query(
        `SELECT id, amount, status, requested_at, resolved_at, note FROM reseller_payout_requests
         WHERE reseller_id = $1 ORDER BY requested_at DESC LIMIT 50`,
        [reseller.id]
      ),
    ]);

    const balanceDue = commissionsRes.rows
      .filter((c) => c.status === "confirmed")
      .reduce((sum, c) => sum + Number(c.commission_amount), 0);
    const totalPaid = commissionsRes.rows
      .filter((c) => c.status === "paid")
      .reduce((sum, c) => sum + Number(c.commission_amount), 0);
    const hasPendingPayoutRequest = payoutsRes.rows.some((p) => p.status === "requested");

    return ok({
      reseller: {
        id: reseller.id,
        status: reseller.status,
        referralCode: reseller.referral_code,
        displayName: reseller.display_name,
      },
      products: productsRes.rows.map((p) => ({
        ...p,
        referralLink: `${config.WEBSITE_URL}/product/${p.slug}?ref=${reseller.referral_code}`,
      })),
      commissions: commissionsRes.rows,
      payoutRequests: payoutsRes.rows,
      balanceDue,
      totalPaid,
      hasPendingPayoutRequest,
      hasPixKey: !!reseller.pix_key,
    });
  } catch (error) {
    console.error("Erro ao buscar dados do revendedor:", error);
    return fail("RESELLER_ME_FETCH_ERROR", 500);
  }
}
