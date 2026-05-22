"use server";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/jwt/init";

export async function GET() {
    try {
        const token = (await cookies()).get("auth_token")?.value;
        if (!token) {
            return NextResponse.json({
                ok: false,
                permissions: [],
            });
        }

        const payload = await verifyJWT(token);
        return NextResponse.json({
            ok: true,
            role: payload.role ?? null,
            permissions: payload.permissions ?? [],
        });
    } catch {
        return NextResponse.json({
            ok: false,
            permissions: [],
        });
    }
}