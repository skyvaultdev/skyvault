"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { requirePermission } from "@/lib/auth/guard";

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// Exportação simples pra contabilidade/conciliação — antes só dava pra
// olhar pedido por pedido na tela, sem jeito de levar os dados pra uma
// planilha.
export async function GET(req: Request) {
  try {
    const { denied } = await requirePermission("orders.read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (from) {
      params.push(from);
      conditions.push(`o.created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`o.created_at <= $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const db = getDB();
    const result = await db.query(
      `SELECT o.id, o.order_number, o.status, u.email AS customer_email, o.subtotal, o.discount,
              o.shipping_fee, o.total, o.created_at, o.paid_at
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       ${where}
       ORDER BY o.created_at DESC`,
      params
    );

    const header = ["id", "numero_pedido", "status", "email_cliente", "subtotal", "desconto", "frete", "total", "criado_em", "pago_em"];
    const rows = result.rows.map((row) =>
      [
        row.id, row.order_number, row.status, row.customer_email, row.subtotal, row.discount,
        row.shipping_fee, row.total, row.created_at, row.paid_at,
      ].map(csvEscape).join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pedidos.csv"`,
      },
    });
  } catch (error) {
    console.error("Erro ao exportar pedidos:", error);
    return NextResponse.json({ ok: false, error: "EXPORT_ERROR" }, { status: 500 });
  }
}
