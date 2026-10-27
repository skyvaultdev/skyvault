import { getDB } from "@/lib/database/db";

export type PublicProductImage = { id: number; url: string; position: number };
export type PublicProductVariation = { id: number; name: string; price: number; stock_count: number; is_unlimited: boolean };

export type PublicProduct = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  category_id: number | null;
  active: boolean;
  position: number | null;
  product_type: "digital" | "physical";
  sku: string | null;
  weight_grams: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  stock_count: number;
  is_unlimited: boolean;
  created_at: string;
  category_name: string | null;
  category_slug: string | null;
  images: PublicProductImage[];
  variations: PublicProductVariation[];
};

// Nunca inclui stock_content/stock_type/store_id — é literalmente o
// conteúdo digital vendido. Reaproveitado pela rota pública
// (app/api/products/[id]/route.ts, inclusive por telas internas que
// chamam essa mesma rota) e pelo Server Component da página de produto
// (app/(public)/product/[slug]/page.tsx), pra não duplicar essa query —
// com a lista explícita de colunas — em dois lugares.
export async function getPublicProduct(idOrSlug: string, canSeeInactive: boolean): Promise<PublicProduct | null> {
  const db = getDB();
  const isNumeric = /^\d+$/.test(idOrSlug);

  const result = await db.query(
    `SELECT p.id, p.name, p.slug, p.description, p.price, p.category_id, p.active, p.position,
            p.product_type, p.sku, p.weight_grams, p.length_cm, p.width_cm, p.height_cm,
            p.stock_count, p.is_unlimited, p.created_at,
            c.name as category_name, c.slug as category_slug
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${isNumeric ? "p.id = $1" : "p.slug = $1"} ${canSeeInactive ? "" : "AND p.active = true"}`,
    [isNumeric ? Number(idOrSlug) : idOrSlug]
  );
  if (result.rows.length === 0) return null;

  const product = result.rows[0];
  const [images, variations] = await Promise.all([
    db.query(`SELECT id, url, position FROM product_images WHERE product_id = $1 ORDER BY position ASC`, [product.id]),
    db.query(`SELECT id, name, price, stock_count, is_unlimited FROM product_variations WHERE product_id = $1 ORDER BY id ASC`, [product.id]),
  ]);

  return { ...product, images: images.rows, variations: variations.rows };
}
