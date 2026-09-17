"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
// Lista o ledger de estoque (aba "Registros Estoque") — busca por produto,
// filtro por motivo (venda/estorno/ajuste manual) e paginação, mesmo
// padrão usado em /api/admin/orders. Requer a migração
// db/migrations/2026-09-17_stock_movements.sql já aplicada no banco.
export async function GET(req: Request) {
  try {
    const { denied } = await requirePermission("products.write");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const reason = searchParams.get("reason")?.trim();
    const direction = searchParams.get("direction")?.trim(); // "in" | "out"
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 25));

    const db = getDB();
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (q) {
      params.push(`%${q}%`);
      const nameIdx = params.length;
      params.push(`%${q}%`);
      const varIdx = params.length;
      if (/^\d+$/.test(q)) {
        params.push(Number(q));
        const orderIdx = params.length;
        where.push(`(sm.product_name ILIKE $${nameIdx} OR sm.variation_name ILIKE $${varIdx} OR sm.order_id = $${orderIdx})`);
      } else {
        where.push(`(sm.product_name ILIKE $${nameIdx} OR sm.variation_name ILIKE $${varIdx} OR o.order_number ILIKE $${nameIdx})`);
      }
    }

    if (reason) {
      params.push(reason);
      where.push(`sm.reason = $${params.length}`);
    }

    if (direction === "in") where.push(`sm.change > 0`);
    if (direction === "out") where.push(`sm.change < 0`);

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const countRes = await db.query(
      `SELECT COUNT(*) AS total FROM stock_movements sm LEFT JOIN orders o ON o.id = sm.order_id ${whereClause}`,
      params
    );

    params.push(pageSize);
    const limitIdx = params.length;
    params.push((page - 1) * pageSize);
    const offsetIdx = params.length;

    const result = await db.query(
      `SELECT
         sm.id, sm.product_id, sm.variation_id, sm.product_name, sm.variation_name,
         sm.change, sm.reason, sm.order_id, o.order_number, sm.note, sm.staff_email, sm.created_at,
         (SELECT url FROM product_images pi WHERE pi.product_id = sm.product_id ORDER BY pi.position ASC LIMIT 1) AS thumbnail_url
       FROM stock_movements sm
       LEFT JOIN orders o ON o.id = sm.order_id
       ${whereClause}
       ORDER BY sm.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    return ok({
      items: result.rows,
      total: Number(countRes.rows[0]?.total ?? 0),
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Erro ao listar registros de estoque:", error);
    return fail("STOCK_MOVEMENTS_LIST_ERROR", 500);
  }
}
