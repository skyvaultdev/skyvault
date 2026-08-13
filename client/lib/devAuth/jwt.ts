"use server";

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { config } from "@/config/configuration";

const secret = new TextEncoder().encode(config.devAuth.secret);

export interface DevJWTPayload extends JWTPayload {
  devId: number;
  email: string;
}

export async function signDevJWT(payload: { devId: number; email: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(config.devAuth.expiresIn)
    .sign(secret);
}

export async function verifyDevJWT(token: string): Promise<DevJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as DevJWTPayload;
  } catch {
    return null;
  }
}
