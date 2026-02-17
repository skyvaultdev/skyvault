import { NextResponse } from 'next/server';
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
    try {
        const { id } = await params;
        if (!/^\d+$/.test(id)) return fail("INVALID_ID", 400);

        const db = getDB();
        const body = (await req.json()) as {
            name?: string;
            slug?: string;
            description?: string;
            price?: number;
            categoryId?: number | null;
            active?: boolean;
        };

        const current = await db.query("SELECT * FROM products WHERE id = $1", [Number(id)]);
        if (current.rows.length === 0) return fail("NOT_FOUND", 404);
        const row = current.rows[0];

        const name = body.name?.trim() || row.name;
        const slug = slugify(body.slug || name);

        const result = await db.query(
            `UPDATE products
       SET name = $1, slug = $2, description = $3, price = $4, category_id = $5, active = $6
       WHERE id = $7
       RETURNING *`,
            [
                name,
                slug,
                body.description ?? row.description,
                body.price ?? row.price,
                body.categoryId ?? row.category_id,
                body.active ?? row.active,
                Number(id),
            ]
        );

        return ok(result.rows[0]);
    } catch (error) {
        console.error(error);
        return fail("INTERNAL_ERROR", 500);
    }
}

export async function PUT(req: Request, ctx: Params) {
    return PATCH(req, ctx);
}
