"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { ROLES } from "@/lib/jwt/permissions";
import { config } from "@/config/configuration";

export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== config.jwt.secret) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  var { email } = await req.json();

  const db = getDB();
  const adminRow = await db.query(
    `SELECT role, blocked FROM admin WHERE email = $1`,
    [email]
  );

  let role = "regular_citizen";
  let permissions: string[] = [];

  if (adminRow.rows.length > 0 && !adminRow.rows[0].blocked) {
    var roleFromDb = adminRow.rows[0].role;

    if (roleFromDb in ROLES) {
      role = roleFromDb;
      permissions = ROLES[role as keyof typeof ROLES];
    }
  }

  // Loja suspensa pelos devs (ex: mensalidade em atraso) — ninguém do
  // time da loja mantém acesso à dashboard enquanto isso, mesmo owner.
  const storeRow = await db.query(`SELECT suspended FROM store_settings ORDER BY id DESC LIMIT 1`);
  if (storeRow.rows[0]?.suspended) {
    role = "regular_citizen";
    permissions = [];
  }

  return NextResponse.json({ role, permissions });
}