"use server";

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { config } from "@/config/configuration";

const secret = new TextEncoder().encode(config.jwt.secret);

// Tipo do SEU payload — estende o JWTPayload padrão do jose
// e declara os campos que você realmente usa no app.
export interface AppJWTPayload extends JWTPayload {
  email: string;
  role: "owner" | "admin" | "editor";
  permissions?: string[];
  roles?: string[];
}

export async function signJWT(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(config.jwt.expiresIn)
    .sign(secret);
}

export async function verifyJWT(token: string): Promise<AppJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as AppJWTPayload;
  } catch {
    return null;
  }
}

export async function hasPermission(token: string, permission: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload) return false;

    const setPerm = (payload.permissions as string[]) || [];
    return setPerm.includes(permission);
  } catch {
    return false;
  }
}

export async function hasRole(token: string, role: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload) return false;

    const setRole = (payload.roles as string[]) || [];
    return setRole.includes(role);
  } catch {
    return false;
  }
}