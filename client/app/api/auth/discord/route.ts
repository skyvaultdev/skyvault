"use server";

import { NextResponse } from "next/server";
import { config } from "../../../config/configuration";
import { genAuthURL } from "../../../lib/auth/auth.link";
const discord = config.discord;

export async function GET() {
  const authLink = genAuthURL(config.discord.scopes);
  return NextResponse.redirect(authLink);
}
