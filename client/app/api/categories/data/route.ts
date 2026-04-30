import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";

export async function GET() {
    try {
        const db = getDB();

        const [categoriesRes] = await Promise.all([db.query(` SELECT id,name,slug FROM categories ORDER BY position ASC`),]);
        const categories = categoriesRes.rows;
        const uncategorized: any[] = [];

        const map = new Map();
        for (const [i, c] of categories.entries()) {
            map.set(c.slug, {
                category: c,
                index: i
            });
        }

        const sections = [...map.values()]
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