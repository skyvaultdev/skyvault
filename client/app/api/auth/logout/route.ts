import { NextResponse } from "next/server";
import { setAuthCookie } from "@/lib/jwt/cookie";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  setAuthCookie(res, "", 0);
  return res;
}
