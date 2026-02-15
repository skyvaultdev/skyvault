"use server";

import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/jwt/init";
import { isPrivateRoute } from "./routeMap"

export async function authMiddleware(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  const { pathname } = req.nextUrl;

  const isPrivate = isPrivateRoute(pathname)
  const hasAdmin = token?.role === "admin";
  
  if (isPrivate && !hasAdmin) {
    if (!token || !(await verifyJWT(token))) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}
