"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

export async function GET() {
  try {
    const { denied } = await requirePermission("wallet.manage");
    if (denied) return denied;

    const db = getDB();
    const [balanceRes, ledgerRes] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(amount), 0) AS balance FROM wallet_ledger`),
      db.query(`SELECT * FROM wallet_ledger ORDER BY created_at DESC LIMIT 100`),
    ]);

    return ok({ balance: Number(balanceRes.rows[0].balance), ledger: ledgerRes.rows });
  } catch (error) {
    console.error("Erro ao buscar saldo:", error);
    return fail("WALLET_FETCH_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { session, denied } = await requirePermission("wallet.manage");
    if (denied) return denied;

    const body = await req.json();
    const amount = Number(body.amount);
    const payoutMethod = String(body.payoutMethod ?? "").trim() || null;
    const payoutDetails = String(body.payoutDetails ?? "").trim() || null;

    if (!amount || amount <= 0) return fail("INVALID_AMOUNT", 400);

    const db = getDB();
    const balanceRes = await db.query(`SELECT COALESCE(SUM(amount), 0) AS balance FROM wallet_ledger`);
    const balance = Number(balanceRes.rows[0].balance);
    if (amount > balance) return fail("INSUFFICIENT_BALANCE", 409);

    const adminRes = await db.query(`SELECT id FROM admin WHERE email = $1`, [session!.email]);
    if (adminRes.rows.length === 0) return fail("ADMIN_NOT_FOUND", 404);

    const result = await db.query(
      `INSERT INTO withdrawal_requests (requested_by_admin_id, amount, payout_method, payout_details)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [adminRes.rows[0].id, amount, payoutMethod, payoutDetails]
    );

    return ok(result.rows[0], 201);
  } catch (error) {
    console.error("Erro ao solicitar resgate:", error);
    return fail("WITHDRAWAL_REQUEST_ERROR", 500);
  }
}
