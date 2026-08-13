"use server";

import { cookies } from "next/headers";
import { verifyDevJWT, type DevJWTPayload } from "./jwt";
import { fail } from "@/lib/api/response";

export async function requireDevSession(): Promise<DevJWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("dev_auth_token")?.value;
  if (!token) return null;
  return verifyDevJWT(token);
}

export async function requireDev() {
  const session = await requireDevSession();
  if (!session) return { session: null, denied: fail("DEV_UNAUTHORIZED", 401) };
  return { session, denied: null };
}
