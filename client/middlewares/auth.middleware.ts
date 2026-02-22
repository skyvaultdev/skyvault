"use server";

import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/jwt/init";
import { isPrivateRoute } from "./routeMap"
import { ROLES } from "@/lib/jwt/permissions"

export async function authMiddleware(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  const { pathname } = req.nextUrl;

  const isPrivate = isPrivateRoute(pathname)
  const uncriptedToken = await verifyJWT(token)
  const role = uncriptedToken?.role
  const admin = Object.keys(ROLES)[0] as string
  const hasAdmin = role === admin;

  if (isPrivate && !hasAdmin) {
    if(uncriptedToken?.permissions) {
      const hasAccess = uncriptedToken.permissions?.includes("dashboard.acess")
      if(hasAccess) {
        return NextResponse.next()
      }
    }
    const url = req.nextUrl.clone();
    token? url.pathname = "/" : url.pathname = "/login"; 

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
