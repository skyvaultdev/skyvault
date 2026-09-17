"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

// "vendidos"/"arrecadados" contavam TODO order_items, inclusive de pedidos
// pending_payment que nunca chegaram a ser pagos — inflava os dois números.
// Corrigido aqui: só orders.status IN ('paid','delivered') entra na conta,
// tanto nos totais quanto na série temporal/top produtos abaixo.
const PAID_STATUSES = "('paid', 'delivered')";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rangeParam = searchParams.get("range") ?? "30d";
    const days = RANGE_DAYS[rangeParam] ?? 30;

    const db = getDB();

    const [acessosRes, vendidosRes, arrecadadosRes, seriesRes, visitsRes, topProductsRes] = await Promise.all([
      db.query("SELECT COUNT(*)::bigint AS total FROM page_views"),
      db.query(`SELECT COALESCE(SUM(oi.quantity), 0)::bigint AS total
                 FROM order_items oi JOIN orders o ON o.id = oi.order_id
                 WHERE o.status IN ${PAID_STATUSES}`),
      db.query(`SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0)::numeric(12,2) AS total
                 FROM order_items oi JOIN orders o ON o.id = oi.order_id
                 WHERE o.status IN ${PAID_STATUSES}`),
      db.query(
        `SELECT date_trunc('day', o.paid_at)::date AS day,
                COALESCE(SUM(oi.quantity), 0)::bigint AS sales,
                COALESCE(SUM(oi.quantity * oi.unit_price), 0)::numeric(12,2) AS revenue
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status IN ${PAID_STATUSES} AND o.paid_at >= NOW() - ($1 || ' days')::interval
         GROUP BY day
         ORDER BY day ASC`,
        [days]
      ),
      db.query(
        `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::bigint AS visits
         FROM page_views
         WHERE created_at >= NOW() - ($1 || ' days')::interval
         GROUP BY day
         ORDER BY day ASC`,
        [days]
      ),
      db.query(
        `SELECT oi.product_name, SUM(oi.quantity)::bigint AS quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status IN ${PAID_STATUSES} AND o.paid_at >= NOW() - ($1 || ' days')::interval
         GROUP BY oi.product_name
         ORDER BY quantity DESC
         LIMIT 5`,
        [days]
      ),
    ]);

    const salesByDay = new Map<string, { sales: number; revenue: number }>();
    for (const row of seriesRes.rows) {
      const key = new Date(row.day).toISOString().slice(0, 10);
      salesByDay.set(key, { sales: Number(row.sales), revenue: Number(row.revenue) });
    }
    const visitsByDay = new Map<string, number>();
    for (const row of visitsRes.rows) {
      const key = new Date(row.day).toISOString().slice(0, 10);
      visitsByDay.set(key, Number(row.visits));
    }

    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - i);
      const key = date.toISOString().slice(0, 10);
      series.push({
        date: key,
        sales: salesByDay.get(key)?.sales ?? 0,
        revenue: salesByDay.get(key)?.revenue ?? 0,
        visits: visitsByDay.get(key) ?? 0,
      });
    }

    return ok({
      acessos: Number(acessosRes.rows[0]?.total ?? 0),
      vendidos: Number(vendidosRes.rows[0]?.total ?? 0),
      arrecadados: Number(arrecadadosRes.rows[0]?.total ?? 0),
      series,
      topProducts: topProductsRes.rows.map((r) => ({ name: r.product_name, quantity: Number(r.quantity) })),
    });
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
