"use server";

import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/jwt/init";
import { ROLES } from "@/lib/jwt/permissions";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

export async function POST(req: Request) {
    const cookieStore = await cookies();
    var token = cookieStore.get("auth_token")?.value;
    if (!token) return fail("UNAUTHORIZED", 401);

    var user = await verifyJWT(token);
    if (!user) return fail("UNAUTHORIZED", 401);
    if (!user.permissions?.includes("team.manage")) return fail("NO_PERMISSION", 403);

    var { email, role } = (await req.json()) as { email: string; role: string };
    if (!Object.keys(ROLES).includes(role)) return fail("INVALID_ROLE", 400);
    var typedRole = role as keyof typeof ROLES;

    const db = await getDB();
    var exists = await db.query( `SELECT id FROM admin WHERE email = $1`,
        [email]
    );

    if (exists?.rows?.length > 0) return fail("ALREADY_ADMIN", 400);

    var { rows: discordUsers } = await db.query(`SELECT id FROM discuser WHERE email = $1`, [email])
    var { rows: regularUser } = await db.query(`SELECT id FROM users WHERE email = $1`, [email])
    var { rows: googleUser } = await db.query(`SELECT id FROM googleuser WHERE email = $1`, [email])
    if(regularUser?.length < 1 && discordUsers?.length < 1 && googleUser?.length < 1) return fail("USER_NOT_FOUND", 400)

    await db.query( `INSERT INTO admin (email,role) VALUES($1,$2)`,
        [email, typedRole]
    );

    return ok({
        role: typedRole,
        permissions: Object.keys(ROLES[typedRole]),
    });
}