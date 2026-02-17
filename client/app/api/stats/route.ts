"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

export async function GET() {
  try {
    const db = getDB();
    const [acessosRes, vendidosRes, arrecadadosRes] = await Promise.all([
      db.query("SELECT COUNT(*)::bigint AS total FROM page_views"),
      db.query("SELECT COALESCE(SUM(quantity), 0)::bigint AS total FROM order_items"),
      db.query("SELECT COALESCE(SUM(quantity * unit_price), 0)::numeric(12,2) AS total FROM order_items"),
    ]);

    return ok({
      acessos: Number(acessosRes.rows[0]?.total ?? 0),
      vendidos: Number(vendidosRes.rows[0]?.total ?? 0),
      arrecadados: Number(arrecadadosRes.rows[0]?.total ?? 0),
    });
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
