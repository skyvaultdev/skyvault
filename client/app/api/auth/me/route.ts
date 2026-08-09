import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/jwt/init";
import { getDB } from "@/lib/database/db";

export async function GET() {
  const cookieStore = await cookies();
  var token = cookieStore.get("auth_token")?.value;

  if (!token) {
    return NextResponse.json({ logged: false });
  }

  try {

    var payload = (await verifyJWT(token)) as { role?: string, email?: string };
    var email = payload.email;
    const db = getDB();

    var  admins = await db.query(`SELECT role FROM admin WHERE email = $1`, [email]);
    if (admins.rows.length > 0) {
      return NextResponse.json({
        logged: true,
        admin: admins.rows.length > 0,
        role: admins.rows[0].role
      });
    }

    var { rows: discordUsers } = await db.query(`SELECT id FROM discuser WHERE email = $1`, [email])
    if (discordUsers.length > 0) {
      return NextResponse.json({ logged: true, admin: false, role: null });
    }

    var { rows: regularUser } = await db.query(`SELECT id FROM users WHERE email = $1`, [email])
    if (regularUser.length > 0) {
      return NextResponse.json({ logged: true, admin: false, role: null });
    }

    var { rows: googleUser } = await db.query(`SELECT id FROM googleuser WHERE email = $1`, [email])
    if (googleUser.length > 0) {
      return NextResponse.json({ logged: true, admin: false, role: null });
    }


  } catch {
    return NextResponse.json({ logged: false });
  }
}
