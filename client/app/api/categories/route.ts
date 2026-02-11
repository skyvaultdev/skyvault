import { NextResponse } from "next/server";
import { getDB } from "../../lib/database/db";

export async function GET(req: Request) {
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    if(!searchParams) NextResponse.json({error: "NO_PARAMS", ok: false });

    const id = searchParams.get("id");
    const db = getDB();

    if (!id) {
        const { rows } = await db.query(`SELECT id, name FROM categories WHERE id = $1 LIMIT 1`, [id]);
        return NextResponse.json(rows);
    } else {
        const { rows } = await db.query(`SELECT id, name FROM categories ORDER BY name ASC`);
        if(rows.length === 0) return NextResponse.json({error: "NO_RESULTS", ok: false });
        return NextResponse.json(rows);
    }
}
