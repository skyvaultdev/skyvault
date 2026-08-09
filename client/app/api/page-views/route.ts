import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";

export async function POST(req: Request) {
    try {
        const db = getDB();
        var { path } = (await req.json().catch(() => ({}))) as { path?: string };

        await db.query(
            "INSERT INTO page_views (path, created_at) VALUES ($1, NOW())",
            [path || "/"]
        );

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("PAGE_VIEWS_ERROR:", err);
        return NextResponse.json({ error: "PAGE_VIEWS_ERROR" }, { status: 500 });

    }
}