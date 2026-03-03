"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { ROLES } from "@/lib/jwt/permissions";

export async function POST(req: Request) {
  const { email } = await req.json();

  const db = getDB();

  const adminRow = await db.query(
    `SELECT role FROM admin WHERE email = $1`,
    [email]
  );

  let role = "regular_citizen";
  let permissions: string[] = [];

  if (adminRow.rows.length > 0) {
    const roleFromDb = adminRow.rows[0].role;

    if (roleFromDb in ROLES) {
      role = roleFromDb;
      permissions = ROLES[role as keyof typeof ROLES];
    }
  }

  return NextResponse.json({ role, permissions });
}