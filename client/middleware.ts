"use server";

import { authMiddleware } from "@/middlewares/auth.middleware";
import { NextRequest } from "next/server";

export default function proxy(req: NextRequest) {
  return authMiddleware(req);
}

export const config = {
  matcher: ["/dashboard:path*"]
};
