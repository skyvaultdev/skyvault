import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";

export async function GET() {
    try {
        const db = getDB();

        const [categoriesRes] = await Promise.all([db.query(` SELECT id,name,slug FROM categories ORDER BY position ASC`),]);
        var categories = categoriesRes.rows;
        var uncategorized: any[] = [];

        var map = new Map();
        for (var [i, c] of categories.entries()) {
            map.set(c.slug, {
                category: c,
                index: i
            });
        }

        var sections = [...map.values()]
        return NextResponse.json({
            success: true,
            data: {
                categories,
                sections,
            },
        });


    } catch (error) {
        return NextResponse.json(
            { success: false, error: "INTERNAL_ERROR" },
            { status: 500 }
        );
    }
}