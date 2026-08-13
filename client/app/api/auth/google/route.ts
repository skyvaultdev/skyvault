"use server"

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { config } from "@/config/configuration";

const google = config.google;

export async function GET(req: Request) {
    const redirectUri = config.WEBSITE_URL + "/api/auth/google/callback";
    const state = randomUUID();

    const params = new URLSearchParams({
        client_id: google.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "consent",
        state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    const res = NextResponse.redirect(authUrl);
    res.cookies.set("oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 10,
    });
    return res;
}