import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";

export async function GET() {
  try {
    const db = getDB();

    const [bannersRes, categoriesRes, productsRes] =
      await Promise.all([
        db.query(`
          SELECT id,title,subtitle,image_url,link
          FROM home_banners
          WHERE active = true
          ORDER BY position ASC
        `),

        db.query(`
          SELECT id,name,slug
          FROM categories
          ORDER BY name ASC
        `),

        db.query(`
          SELECT
            p.id,
            p.name,
            p.slug,
            p.price,

            c.name AS category_name,
            c.slug AS category_slug,

            (
              SELECT pi.url
              FROM product_images pi
              WHERE pi.product_id = p.id
              ORDER BY pi.position ASC
              LIMIT 1
            ) AS image_url

          FROM products p
          LEFT JOIN categories c
            ON c.id = p.category_id

          WHERE p.active = true

          ORDER BY
            COALESCE(p.position, 2147483647),
            p.created_at DESC

          LIMIT 60
        `),
      ]);

    const banners = bannersRes.rows;
    const categories = categoriesRes.rows;
    const products = productsRes.rows;

    const highlights = products.slice(0, 3);

    const uncategorized: any[] = [];

    const map = new Map();

    for (const c of categories) {
      map.set(c.slug, {
        category: c,
        items: [],
      });
    }

    for (const p of products) {
      if (!p.category_slug) {
        uncategorized.push(p);
        continue;
      }

      const bucket = map.get(p.category_slug);

      if (bucket) bucket.items.push(p);
    }

    const sections = [...map.values()].filter(
      (x: any) => x.items.length > 0
    );

    if (uncategorized.length > 0) {
      sections.push({
        category: {
          id: 0,
          name: "Outros",
          slug: "outros",
        },
        items: uncategorized,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        banners,
        categories,
        highlights,
        sections,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "erro interno" },
      { status: 500 }
    );
  }
}