"use server";

import { cookies } from "next/headers";
import { type AppJWTPayload } from "@/lib/jwt/init";
import { verifyJWTForStore } from "@/lib/jwt/storeAware";

export type SecureSessionPayload = AppJWTPayload & {
  permissions: string[];
};

export async function getSession(): Promise<SecureSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;

  const payload = await verifyJWTForStore(token);
  if (!payload) return null;

  return {
    ...payload,
    permissions: payload.permissions ?? [],
  } as SecureSessionPayload;
}
