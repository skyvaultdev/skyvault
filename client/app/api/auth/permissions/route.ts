"use server";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWTForStore } from "@/lib/jwt/storeAware";

export async function GET() {
    try {
        var token = (await cookies()).get("auth_token")?.value;
        if (!token) {
            return NextResponse.json({
                ok: false,
                permissions: [],
            });
        }

        var payload = await verifyJWTForStore(token);
        if (!payload) {
            return NextResponse.json({
                ok: false,
                permissions: [],
            });
        }
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