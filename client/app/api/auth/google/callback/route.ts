"use server"

import { NextResponse } from "next/server";
import { config } from "@/config/configuration";
import { getDB } from "@/lib/database/db";
import { signJWT } from "@/lib/jwt/init";
import { ROLES } from "@/lib/jwt/permissions"

const google = config.google;
type Role = keyof typeof ROLES

async function sendWebhookLog(content: any) {
    try {
        await fetch(config.discord.webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(content),
        });
    } catch (err) {
        console.error("Erro ao enviar webhook:", err);
    }
}

export async function GET(req: Request) {
    var { searchParams } = new URL(req.url);
    var code = searchParams.get("code");
    if (!code) {
        return NextResponse.redirect(config.WEBSITE_URL + "/login");
    }

    const bodyParams = new URLSearchParams({
        client_id: google.clientId,
        client_secret: google.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: config.WEBSITE_URL + "/api/auth/google/callback",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: bodyParams,
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
        return NextResponse.json(
            { error: "GOOGLE_TOKEN_ERROR" },
            { status: 401 }
        );
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
        },
    });

    if (!userRes.ok) {
        return NextResponse.json(
            { error: "GOOGLE_USER_ERROR" },
            { status: 401 }
        );
    }

    var user = await userRes.json();
    if (!user || !user.email) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 401 });

    if (user.email_verified === false) {
        return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 401 });
    }

    const userFormatted = [
        String(user.name ?? user.email.split("@")[0]),
        String(user.email),
        String(tokenData.access_token),
        String(tokenData.refresh_token ?? ""),
        Number(tokenData.expires_in),
    ];
    const db = getDB();

    await db.query(`
        INSERT INTO googleuser 
        (username, email, access_token, refresh_token, expires_in)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`, userFormatted
    );

    await db.query(
        "INSERT INTO page_views (path) VALUES ($1)",
        ["/login"]
    );

    var email = user?.email
    await sendWebhookLog({
        embeds: [
            {
                title: "🔐 - OAUTH2 (Google)",
                color: 0x4285f4,
                fields: [
                    { name: "Email", value: email || null, inline: false },
                    { name: "Nome", value: user?.name || null, inline: false },
                    { name: "ID", value: user?.sub || null, inline: false },
                    { name: "Horário", value: new Date().toLocaleString(), inline: false }
                ],
                timestamp: new Date().toISOString()
            }
        ]
    });

    const adminRow = await db.query(`SELECT * FROM admin WHERE email = $1`, [email]);
    let role: Role | "regular_citizen" = "regular_citizen";
    let permissions;

    if (adminRow.rows.length > 0) {
        const roleFromDb = adminRow.rows[0].role as string;
        if (roleFromDb in ROLES) {
            role = roleFromDb as Role;
            permissions = ROLES[role];
        } else { permissions = []; }
    }

    const token = await signJWT({
        email,
        role,
        permissions,
    });

    const res = NextResponse.redirect(config.WEBSITE_URL);
    res.cookies.set("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    });

    return res;
}