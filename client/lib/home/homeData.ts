import { getDB } from "@/lib/database/db";
import type { Banner, Category, Product, SpotlightProduct } from "@/lib/home/renderHomeSection";

// Dados brutos da home (produtos, categorias, banners legados, destaques) —
// usado pela home de verdade (app/page.tsx) e pela prévia da dashboard, pra
// garantir que as duas mostrem exatamente os mesmos dados.
export async function getHomeData() {
  const db = getDB();

  const [bannersRes, categoriesRes, productsRes] = await Promise.all([
    db.query<Banner>("SELECT id,title,subtitle,image_url,link FROM home_banners WHERE active = true ORDER BY position ASC"),
    db.query<Category>("SELECT id, name, slug FROM categories ORDER BY position ASC"),
    db.query<Product>(`
      SELECT
        p.id, p.name, p.slug, p.price,
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
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.active = true
      ORDER BY COALESCE(p.position, 2147483647), p.created_at DESC
      LIMIT 60
    `),
  ]);

  return {
    banners: bannersRes.rows,
    categories: categoriesRes.rows,
    products: productsRes.rows,
  };
}

export async function getSpotlightProducts(ids: number[]) {
  const map = new Map<number, SpotlightProduct>();
  if (ids.length === 0) return map;
  const res = await getDB().query<SpotlightProduct>(
    `SELECT p.id, p.name, p.slug, p.price, p.description, c.name AS category_name, c.slug AS category_slug,
            (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position ASC LIMIT 1) AS image_url
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id = ANY($1) AND p.active = true`,
    [ids]
  );
  for (const r of res.rows) map.set(Number(r.id), r);
  return map;
}

export function buildCategorySections(categories: Category[], products: Product[]) {
  const uncategorizedItems: Product[] = [];
  const map = new Map<string, { category: Category; items: Product[] }>();
  for (const c of categories) map.set(c.slug, { category: c, items: [] });

  for (const p of products) {
    const key = p.category_slug;
    if (!key) {
      uncategorizedItems.push(p);
      continue;
    }
    const bucket = key ? map.get(key) : undefined;
    if (bucket) bucket.items.push(p);
  }

  const sections = [...map.values()].filter((b) => b.items.length > 0);
  if (uncategorizedItems.length > 0) {
    sections.push({ category: { id: 0, name: "Outros", slug: "outros" }, items: uncategorizedItems });
  }
  return sections;
}
