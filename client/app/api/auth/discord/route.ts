"use server";

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { config } from "@/config/configuration";
import { genAuthURL } from "@/lib/auth/auth.link";
const discord = config.discord;

export async function GET() {
  const state = randomUUID();
  const authLink = `${genAuthURL(config.discord.scopes)}&state=${encodeURIComponent(state)}`;

  const res = NextResponse.redirect(authLink);
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
