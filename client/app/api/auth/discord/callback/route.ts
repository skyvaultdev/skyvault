"use server"
import { getCurrentStoreId } from "@/lib/tenant/tenantContext";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { config } from "@/config/configuration";
import { getDB } from "@/lib/database/db";
import { signJWT } from "@/lib/jwt/init";
import { setAuthCookie } from "@/lib/jwt/cookie";
import { ROLES } from "@/lib/jwt/permissions"
import { encryptToken } from "@/lib/security/tokenCrypto";
import { sendWelcomeEmail } from "@/lib/mail/sendWelcomeEmail";
const discord = config.discord;
type Role = keyof typeof ROLES

async function sendWebhookLog(content: any) {
    try {
        await fetch(discord.webhookUrl, {
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
    var state = searchParams.get("state");

    const cookieStore = await cookies();
    const expectedState = cookieStore.get("oauth_state")?.value;

    if (!code || !state || !expectedState || state !== expectedState) {
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

    var user = await userRes.json();
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 401 });

    const userFormatted = [
        String(user.username),
        String(user.email),
        encryptToken(String(tokenData.access_token)),
        encryptToken(String(tokenData.refresh_token)),
        Number(tokenData.expires_in),
    ];
    const db = getDB();

    await db.query(`
        INSERT INTO discuser
        (username, email, access_token, refresh_token, expires_in)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (store_id, email) DO NOTHING`, userFormatted
    );

    const insertedUser = await db.query(
        `INSERT INTO users (username, email, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (store_id, email) DO NOTHING RETURNING id`,
        [userFormatted[0], userFormatted[1]]
    );
    // RETURNING só vem vazio quando ON CONFLICT DO NOTHING bateu (conta já
    // existia) — rows.length > 0 prova que essa foi a PRIMEIRA vez.
    if (insertedUser.rows.length > 0) {
        sendWelcomeEmail({ to: userFormatted[1] as string, name: userFormatted[0] as string }).catch((err) =>
            console.error(`Erro ao enviar email de boas-vindas (Discord) para ${userFormatted[1]}:`, err)
        );
    }
    await db.query(
        `UPDATE discuser SET user_id = (SELECT id FROM users WHERE email = $1) WHERE email = $1 AND user_id IS NULL`,
        [userFormatted[1]]
    );

    await db.query(
        "INSERT INTO page_views (path) VALUES ($1)",
        ["/login"]
    );

    var email = user?.email
    // Sem email no payload — vai pra um canal do Discord (fora do nosso
    // controle: pode vazar, mudar de membros, ficar com retenção
    // indefinida). ID interno (não o id externo do Discord) + username
    // bastam pra auditar "quem logou quando" sem mandar dado pessoal de
    // verdade pra fora.
    const internalUserIdRow = await db.query(`SELECT id FROM users WHERE email = $1`, [userFormatted[1]]);
    const internalUserId = internalUserIdRow.rows[0]?.id ?? null;
    await sendWebhookLog({
        embeds: [
            {
                title: "🔐 - OAUTH2 (Discord)",
                color: 0x00ff99,
                fields: [
                    { name: "Provedor", value: "Discord", inline: true },
                    { name: "ID interno", value: String(internalUserId ?? "desconhecido"), inline: true },
                    { name: "Usuário", value: user.username, inline: false },
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
        } else {permissions = [];}
    }

    const token = await signJWT({
      sid: await getCurrentStoreId(),
        email,
        role,
        permissions,
    });

    const res = NextResponse.redirect(config.WEBSITE_URL);
    setAuthCookie(res, token);
    res.cookies.delete("oauth_state");

    return res;
}


