"use server";

import { SignJWT, jwtVerify } from "jose";
import { config } from "@/config/configuration";

const secret = new TextEncoder().encode(config.jwt.secret);

export async function signJWT(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(config.jwt.expiresIn)
    .sign(secret);
}

export async function verifyJWT(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export async function hasPermission(token: string, permission: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    if(!payload) return false
    
    const setPerm = (payload.permissions as string[]) || [];
    if (!setPerm.includes(permission)) {
      return false;
    } else return true;
  } catch {
    return false;
  }
}