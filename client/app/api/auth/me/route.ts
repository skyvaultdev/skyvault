import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/jwt/init";
import { getDB } from "@/lib/database/db";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    return NextResponse.json({ logged: false });
  }

  try {

    const payload = (await verifyJWT(token)) as { role?: string, email?: string };
    const email = payload.email;
    const db = getDB();
    const result = await db.query(`SELECT role FROM admin WHERE email = $1`, [email]);

    return NextResponse.json({ 
      logged: true, 
      admin: result.rows.length > 0,
      role: result.rows[0].role 
    });

  } catch {
    return NextResponse.json({ logged: false });
  }
}
