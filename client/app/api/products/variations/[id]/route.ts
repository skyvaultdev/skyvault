"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
    try {
        const { id } = await params;
        const db = getDB();
        const isNumeric = /^\d+$/.test(id);
        const result = isNumeric ?
        await db.query(`SELECT product_id, name, price, position FROM product_variations WHERE product_id = $1`, [Number(id)])
        : await db.query(`SELECT product_id,name, price, position FROM product_variations WHERE product_id = $1`, [id])

        if (result.rows.length === 0) return fail("NOT_FOUND", 404);

        return ok({ ...result.rows });
    } catch (error) {
        console.error(error);
        return fail("INTERNAL_ERROR", 500);
    }
}