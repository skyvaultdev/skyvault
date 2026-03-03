import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/jwt/init";
import { fail, ok } from "@/lib/api/response";

type RouteParams = {
    params: Promise<{ id: string, target: string }>;
};

export async function GET(req: Request, { params }: RouteParams) {
    const { id, target } = await params;
    const db = getDB();


    const table = target === "variation" ? "product_variations" : "products";
    const result = await db.query(
        `SELECT id, name, stock_type, stock_content, stock_count 
         FROM ${table} 
         WHERE id = $1`,
        [id]
    );

    if (result.rows.length === 0) return fail("NOT_FOUND", 404);

    const item = result.rows[0];
    return ok({
        ...item,
        stock_type: item.stock_type || 'key',
        stock_content: item.stock_content || "",
        stock_count: Number(item.stock_count) || 0
    });
}