"use server";

import { authMiddleware } from "./middlewares/auth.middleware";
import { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  return authMiddleware(req);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api).*)"]
};
