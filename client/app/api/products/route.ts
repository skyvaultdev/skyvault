"use server";

import { NextResponse } from "next/server";
import { getDB } from "../../../lib/database/db";

export async function GET(req: Request) {
    try {
        const seatchParams = new URL(req.url)
        const name = searchParams.get("name");
        const db = await getDB();
        if (name) {
            const result = await db.query(`
                SELECT id, name, slug, price, description, image_url, category_id FROM products LIMIT 1`, [name]
            );

            if (result.rows.length === 0) {
                return NextResponse.json(
                    { ok: false, error: "NOT_FOUND" },
                    { status: 404 }
                );
            }

            return NextResponse.json({
                ok: true,
                product: result.rows[0],
            });
        } else {
            const result = await db.query(`
                SELECT id, name, slug, price, description, image_url, category_id FROM products`,
            );

            if (result.rows.length === 0) {
                return NextResponse.json(
                    { ok: false, error: "NOT_FOUND" },
                    { status: 404 }
                );
            }

            return NextResponse.json({
                ok: true,
                product: result.rows,
            });
        }
    } catch {
        console.error(err);
        return NextResponse.json(
            { ok: false, error: "INTERNAL_ERROR" },
            { status: 500 }
        );
    }

}