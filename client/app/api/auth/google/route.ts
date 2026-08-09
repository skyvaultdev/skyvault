"use server"

import { NextResponse } from "next/server";
import { config } from "@/config/configuration";

const google = config.google;

export async function GET(req: Request) {
    const redirectUri = config.WEBSITE_URL + "/api/auth/google/callback";

    const params = new URLSearchParams({
        client_id: google.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "consent",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return NextResponse.redirect(authUrl);
}