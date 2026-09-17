import { NextRequest, NextResponse } from "next/server";
import { verifyJWT, signJWT } from "@/lib/jwt/init";
import { isPrivateRoute, isStaffOnlyRoute } from "./routeMap";
import { config } from "@/config/configuration";

export async function authMiddleware(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  const { pathname } = req.nextUrl;

  const isPrivate = isPrivateRoute(pathname);

  if (!token) {
    if (isPrivate) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const decrypted = await verifyJWT(token);
  if (!decrypted) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next();
  const syncRes = await fetch(
    new URL("/api/internal/sync-user", config.WEBSITE_URL),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": config.jwt.secret,
      },
      body: JSON.stringify({ email: decrypted.email }),
    }
  );

  const { role, permissions } = await syncRes.json();
  const roleChanged = decrypted.role !== role;
  const permsChanged = JSON.stringify(decrypted.permissions) !== JSON.stringify(permissions);

  if (roleChanged || permsChanged) {
    const newToken = await signJWT({
      email: decrypted.email,
      role,
      permissions,
    });

    response.cookies.set("auth_token", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  if (isStaffOnlyRoute(pathname) && !permissions.includes("dashboard.access")) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}