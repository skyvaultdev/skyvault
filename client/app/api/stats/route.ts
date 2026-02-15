import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";

export async function GET() {
  try {
    const db = await getDB();

    const acessosRes = await db.query(
      "SELECT COUNT(*)::bigint AS acessos FROM page_views"
    );

    const vendidosRes = await db.query(
      "SELECT COALESCE(SUM(quantity), 0)::bigint AS vendidos FROM order_items"
    );

    const arrecadadosRes = await db.query(
      "SELECT COALESCE(SUM(quantity * unit_price), 0)::numeric(12,2) AS arrecadados FROM order_items"
    );

    const acessos = Number(acessosRes.rows[0]?.acessos ?? 0);
    const vendidos = Number(vendidosRes.rows[0]?.vendidos ?? 0);
    const arrecadados = Number(arrecadadosRes.rows[0]?.arrecadados ?? 0);

    return NextResponse.json({ acessos, vendidos, arrecadados });
  } catch (err) {
    console.error("STATS_ERROR:", err);
    return NextResponse.json({ error: "STATS_ERROR" }, { status: 500 });
  }
}