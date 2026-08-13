import { NextRequest, NextResponse } from "next/server";
import { verifyDevJWT } from "@/lib/devAuth/jwt";

// Completamente separada de auth.middleware.ts (a da loja) — cookie
// próprio, segredo de assinatura próprio. Um token de admin/owner da loja
// não abre nada aqui, e vice-versa.
export async function devAuthMiddleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/dev/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get("dev_auth_token")?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/dev/login";
    return NextResponse.redirect(url);
  }

  const decoded = await verifyDevJWT(token);
  if (!decoded) {
    const url = req.nextUrl.clone();
    url.pathname = "/dev/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
