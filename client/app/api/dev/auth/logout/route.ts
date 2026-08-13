"use server";

import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("dev_auth_token", "", { path: "/", maxAge: 0 });
  return res;
}
