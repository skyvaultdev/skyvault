"use server";

import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/jwt/init";
import { ROLES } from "@/lib/jwt/permissions";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

export async function POST(req: Request) {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;

    const user = await verifyJWT(token);
    if (!user.permissions?.includes("team.manage")) return fail("NO_PERMISSION", 403);

    const { email, role } = await req.json();
    if (!ROLES[role]) return fail("INVALID_ROLE", 400);

    const db = await getDB();
    const exists = await db.query( `SELECT id FROM admin WHERE email = $1`,
        [email]
    );

    if (exists?.rows?.length > 0) return fail("ALREADY_ADMIN", 400);

    const { rows: discordUsers } = await db.query(`SELECT id FROM discuser WHERE email = $1`, [email])
    const { rows: regularUser } = await db.query(`SELECT id FROM users WHERE email = $1`, [email])
    if(regularUser?.length < 1 || discordUsers?.length < 1) return fail("USER_NOT_FOUND", 400)

    await db.query( `INSERT INTO admin (email,role) VALUES($1,$2)`,
        [email, role]
    );

    return ok({
        role,
        permissions: Object.keys(ROLES[role]),
    });
}