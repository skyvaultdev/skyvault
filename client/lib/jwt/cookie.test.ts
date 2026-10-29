import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { setAuthCookie, AUTH_COOKIE_NAME } from "./cookie";

describe("setAuthCookie", () => {
  it("seta o cookie com httpOnly, sameSite=lax, path=/ e maxAge de 7 dias por padrão", () => {
    const res = NextResponse.json({ ok: true });
    setAuthCookie(res, "token-de-teste");

    const cookie = res.cookies.get(AUTH_COOKIE_NAME);
    expect(cookie?.value).toBe("token-de-teste");

    const setCookieHeader = res.headers.get("set-cookie") ?? "";
    expect(setCookieHeader).toContain("HttpOnly");
    expect(setCookieHeader).toMatch(/SameSite=Lax/i);
    expect(setCookieHeader).toContain("Path=/");
    expect(setCookieHeader).toContain(`Max-Age=${60 * 60 * 24 * 7}`);
  });

  it("aceita um maxAge customizado (ex: logout, que zera o cookie)", () => {
    const res = NextResponse.json({ ok: true });
    setAuthCookie(res, "", 0);

    const setCookieHeader = res.headers.get("set-cookie") ?? "";
    expect(setCookieHeader).toContain("Max-Age=0");
  });
});
