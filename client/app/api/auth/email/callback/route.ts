"use server";

import { getCurrentStoreId } from "@/lib/tenant/tenantContext";

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getDB } from "@/lib/database/db";
import { config } from "@/config/configuration"
import { signJWT, verifyJWT } from "@/lib/jwt/init";
import { setAuthCookie } from "@/lib/jwt/cookie";
import { ROLES } from "@/lib/jwt/permissions"
import { rateLimit } from "@/lib/security/rateLimit";
type Role = keyof typeof ROLES

function hashCode(code: string) {
    return createHash("sha256").update(code).digest("hex");
}

export async function POST(req: Request) {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const code = body?.code;

    if (!email || !code) {
        return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });
    }

    if (!rateLimit(`otp-verify:${email}`, 10, 10 * 60_000)) {
        return NextResponse.json({ error: "TOO_MANY_ATTEMPTS" }, { status: 429 });
    }

    var username = email.split("@")[0] as String
    const db = getDB();
    var codeHash = hashCode(code);
    const result = await db.query(`SELECT * FROM email_verification WHERE email = $1 AND code_hash = $2 AND expires_at > NOW()`,
        [email, codeHash]
    );

    if (result.rows.length === 0) {
        return NextResponse.json(
            { error: "INVALID_OR_EXPIRED_CODE" },
            { status: 401 }
        );
    }

    await db.query(
        `DELETE FROM email_verification WHERE email = $1`,
        [email]
    );

    await db.query(`INSERT INTO users (username, email, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (store_id, email) DO NOTHING`,
        [username, email]
    );

    const adminRow = await db.query(`SELECT * FROM admin WHERE email = $1`, [email]);
    let role: Role | "regular_citizen" = "regular_citizen";
    let permissions;

    if (adminRow.rows.length > 0) {
        const roleFromDb = adminRow.rows[0].role as string;
        if (roleFromDb in ROLES) {
            role = roleFromDb as Role;
            permissions = ROLES[role];
        } else {permissions = [];}
    }

    const token = await signJWT({
      sid: await getCurrentStoreId(),
        email,
        role,
        permissions,
    });

    const res = NextResponse.json({ ok: true });
    setAuthCookie(res, token);
    return res;
}