"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { getSession } from "@/lib/jwt/session";

export async function GET(req: Request) {
    const session = await getSession();
    if (!session || !session.permissions.includes("chat.access")) {
        return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    if (!q || q.length < 2) return NextResponse.json({ data: [] });

    const like = `%${q}%`;
    const db = await getDB();
    const { rows } = await db.query(
        `SELECT email, MAX(username) as username FROM (
       SELECT email, username FROM users WHERE username ILIKE $1 OR email ILIKE $1
       UNION
       SELECT email, username FROM discuser WHERE username ILIKE $1 OR email ILIKE $1
       UNION
       SELECT email, username FROM googleuser WHERE username ILIKE $1 OR email ILIKE $1
     ) t
     GROUP BY email
     LIMIT 20`,
        [like]
    );

    return NextResponse.json({ data: rows });
}