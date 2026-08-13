"use server";

import { cookies } from "next/headers";
import { verifyJWT, type AppJWTPayload } from "@/lib/jwt/init";
import { fail } from "@/lib/api/response";

export async function requireSession(): Promise<AppJWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  return verifyJWT(token);
}

export async function requirePermission(permission: string) {
  const session = await requireSession();
  if (!session) return { session: null, denied: fail("UNAUTHORIZED", 401) };
  if (!session.permissions?.includes(permission)) {
    return { session, denied: fail("NO_PERMISSION", 403) };
  }
  return { session, denied: null };
}
