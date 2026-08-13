"use server";

import { authMiddleware } from "@/middlewares/auth.middleware";
import { devAuthMiddleware } from "@/middlewares/devAuth.middleware";
import { NextRequest } from "next/server";

export default function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/dev")) {
    return devAuthMiddleware(req);
  }
  return authMiddleware(req);
}

export const config = {
  matcher: ["/dashboard:path*", "/dev:path*"]
};
