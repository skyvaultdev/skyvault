"use server";

import { cookies } from "next/headers";
import { verifyJWT, type AppJWTPayload } from "@/lib/jwt/init";

export async function getSession(): Promise<AppJWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;

  return verifyJWT(token);
}