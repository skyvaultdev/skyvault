"use server"

import { NextResponse } from "next/server";
import { config } from "../../../../config/configuration";
import { getDB } from "../../../../lib/database/db";
import { signJWT, verifyJWT } from "../../../../lib/jwt/init";
const discord = config.discord;

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    if (!code) {
        return NextResponse.redirect(config.WEBSITE_URL + "/login");
    }

    const bodyParams = new URLSearchParams({
        client_id: discord.clientId,
        client_secret: discord.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: config.WEBSITE_URL + "/api/auth/discord/callback",
    });

    const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: bodyParams,
    });


    const tokenData = await tokenRes.json();
    const userRes = await fetch("https://discord.com/api/v10/users/@me", {
        headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
        },
    });

    if (!tokenRes.ok) {
        return NextResponse.json(
            { error: "DISCORD_TOKEN_ERROR" },
            { status: 401 }
        );
    }

    if (!userRes.ok) {
        return NextResponse.json(
            { error: "DISCORD_USER_ERROR" },
            { status: 401 }
        );
    }

    const user = await userRes.json();
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 401 });

    const userFormatted = [
        String(user.username),
        String(user.email),
        String(tokenData.access_token),
        String(tokenData.refresh_token),
        Number(tokenData.expires_in),
    ];
    const db = getDB();

    await db.query(`
        INSERT INTO discuser 
        (username, email, access_token, refresh_token, expires_in)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`, userFormatted
    );

    const email = user.email
    const token = await signJWT({email});
    const res = NextResponse.json({ ok: true });
    res.cookies.set("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7
    })


    return NextResponse.redirect(config.WEBSITE_URL);
}
