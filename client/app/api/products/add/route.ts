"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const name = formData.get("name") as string;
    const slug = formData.get("slug") as string;
    const description = formData.get("description") as string | null;
    const price = Number(formData.get("price"));
    const category_id = formData.get("category_id") || null;
    const active = formData.get("active") !== "false";
    const image = formData.get("image") as File | null;

    if (!name || !slug || !price) {
      return NextResponse.json(
        { error: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    const db = getDB();
    const productResult = await db.query(`INSERT INTO products (name, slug, description, price, category_id, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        name,
        slug,
        description ?? null,
        price,
        category_id || null,
        active,
      ]
    );

    const productId = productResult.rows[0].id;
    if (image && image.size > 0) {

      if (!image.type.startsWith("image/")) {
        return NextResponse.json(
          { error: "INVALID_FILE_TYPE" },
          { status: 400 }
        );
      }

      if (image.size > 5_000_000) {
        return NextResponse.json(
          { error: "FILE_TOO_LARGE" },
          { status: 400 }
        );
      }

      const bytes = await image.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const uploadDir = path.join(process.cwd(), "public/uploads");
      await mkdir(uploadDir, { recursive: true });

      const ext = path.extname(image.name);
      const fileName = `${crypto.randomUUID()}${ext}`;
      const filePath = path.join(uploadDir, fileName);
      await writeFile(filePath, buffer);

      const imageUrl = `/public/uploads/${fileName}`;
      await db.query(
        `INSERT INTO product_images (product_id, url)
         VALUES ($1, $2)`,
        [productId, imageUrl]
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });

  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
