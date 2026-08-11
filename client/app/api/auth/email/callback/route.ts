"use server";

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getDB } from "@/lib/database/db";
import { config } from "@/config/configuration"
import { signJWT, verifyJWT } from "@/lib/jwt/init";
import { ROLES } from "@/lib/jwt/permissions"
import { upsertCanonicalUser } from "@/lib/auth/identity";
type Role = keyof typeof ROLES

function hashCode(code: string) {
    return createHash("sha256").update(code).digest("hex");
}

export async function POST(req: Request) {
    const { email, code } = await req.json();

    if (!email || !code) {
        return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });
    }

    const username = email.split("@")[0];
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

    const userId = await upsertCanonicalUser(email, username);

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
        sub: String(userId),
        email,
        role,
        permissions,
    });

    const res = NextResponse.json({ ok: true });

    res.cookies.set("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    });

    return res;
}