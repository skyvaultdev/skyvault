"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { denied } = await requirePermission("resellers.manage");
    if (denied) return denied;

    const { id } = await params;
    const resellerId = Number(id);
    if (!resellerId) return fail("INVALID_RESELLER_ID", 400);

    const db = getDB();
    const rows = await db.query(
      `SELECT rp.id, rp.product_id, rp.commission_percent, p.name AS product_name, p.slug, p.price
       FROM reseller_products rp
       JOIN products p ON p.id = rp.product_id
       WHERE rp.reseller_id = $1
       ORDER BY p.name ASC`,
      [resellerId]
    );
    return ok(rows.rows);
  } catch (error) {
    console.error("Erro ao listar produtos do revendedor:", error);
    return fail("RESELLER_PRODUCTS_FETCH_ERROR", 500);
  }
}

// Autoriza (ou atualiza a % de comissão de) um produto pra esse
// revendedor específico — upsert, pra reenviar o mesmo produto com uma %
// nova só atualizar em vez de duplicar.
export async function POST(req: Request, { params }: Params) {
  try {
    const { denied } = await requirePermission("resellers.manage");
    if (denied) return denied;

    const { id } = await params;
    const resellerId = Number(id);
    if (!resellerId) return fail("INVALID_RESELLER_ID", 400);

    const body = await req.json();
    const productId = Number(body.productId);
    const commissionPercent = Number(body.commissionPercent);
    if (!productId) return fail("INVALID_PRODUCT_ID", 400);
    if (!(commissionPercent > 0 && commissionPercent <= 100)) return fail("INVALID_COMMISSION_PERCENT", 400);

    const db = getDB();
    const resellerRes = await db.query(`SELECT id FROM resellers WHERE id = $1`, [resellerId]);
    if (resellerRes.rows.length === 0) return fail("RESELLER_NOT_FOUND", 404);
    const productRes = await db.query(`SELECT id FROM products WHERE id = $1`, [productId]);
    if (productRes.rows.length === 0) return fail("PRODUCT_NOT_FOUND", 404);

    await db.query(
      `INSERT INTO reseller_products (reseller_id, product_id, commission_percent)
       VALUES ($1, $2, $3)
       ON CONFLICT (reseller_id, product_id) DO UPDATE SET commission_percent = EXCLUDED.commission_percent`,
      [resellerId, productId, commissionPercent]
    );

    return ok({ updated: true });
  } catch (error) {
    console.error("Erro ao autorizar produto pro revendedor:", error);
    return fail("RESELLER_PRODUCT_UPDATE_ERROR", 500);
  }
}
