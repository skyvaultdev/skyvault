"use server";

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getDB } from "@/lib/database/db";
import { config } from "@/config/configuration"
import { signJWT, verifyJWT } from "@/lib/jwt/init";

function hashCode(code: string) {
    return createHash("sha256").update(code).digest("hex");
}

export async function POST(req: Request) {
    const { email, code } = await req.json();

    if (!email || !code) {
        return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });
    }

    const username = email.split("@")[0] as String
    const db = getDB();
    const codeHash = hashCode(code);
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

    await db.query(`INSERT INTO users (username, email, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (email) DO NOTHING`,
        [username, email]
    );

    const adminRow = await db.query(`SELECT * FROM admin WHERE email = $1`, [email]);
    if (adminRow.rows.length > 0) {
        const token = await signJWT({
            email: email,
            role: "admin",
            permissions: ["admin"]
        });

        const res = NextResponse.redirect(config.WEBSITE_URL);
        res.cookies.set("auth_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
            maxAge: 60 * 60 * 24 * 7
        })

        return res
    } else {
        const token = await signJWT({
            email: email,
            role: "regular_citzen",
            permissions: []
        });

        const res = NextResponse.redirect(config.WEBSITE_URL);
        res.cookies.set("auth_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
            maxAge: 60 * 60 * 24 * 7
        })

        return res
    }
}