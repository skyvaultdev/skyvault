"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";

export async function GET() {
  try {
    const db = getDB();
    const result = await db.query("SELECT id, email FROM admin ORDER BY email ASC");
    return NextResponse.json({ admins: result.rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
