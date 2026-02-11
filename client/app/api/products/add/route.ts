"use server";

import { NextResponse } from "next/server";
import { getDB } from "../../../lib/database/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      slug,
      description,
      price,
      image_url,
      category_id,
      active = true,
    } = body;

    if (!name || !slug || !price) {
      return NextResponse.json(
        { error: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    const db = await getDB();
    const result = await db.query(`INSERT INTO products (name, slug, description, price, category_id, active)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        name,
        slug,
        description ?? null,
        price,
        category_id ?? null,
        active,
      ]
    );

    return NextResponse.json(
      { ok: true },
      { status: 200 }
    );

  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}