import Link from "next/link";
import { getDB } from "@/lib/database/db";

type SearchParams = Promise<{ category?: string }>;

async function loadData(categorySlug?: string) {
  const db = getDB();
  const categoriesRes = await db.query("SELECT id, name, slug FROM categories ORDER BY name ASC");

  const productsRes = categorySlug
    ? await db.query(
      `SELECT p.id, p.name, p.slug, p.price,
                (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
         FROM products p
         JOIN categories c ON c.id = p.category_id
         WHERE c.slug = $1
         ORDER BY COALESCE(p.position, 2147483647), p.created_at DESC`,
      [categorySlug]
    )
    : await db.query(
      `SELECT p.id, p.name, p.slug, p.price,
                (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position ASC LIMIT 1) AS image_url
         FROM products p
         ORDER BY COALESCE(p.position, 2147483647), p.created_at DESC`
    );

  return { categories: categoriesRes.rows, products: productsRes.rows };
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selected = params.category;
  const { categories, products } = await loadData(selected);

  return (
    <main style={{ padding: 24, color: "white", display: "grid", gridTemplateColumns: "240px 1fr", gap: 16 }}>
      <aside style={{ border: "1px solid #333", borderRadius: 12, padding: 12 }}>
        <h3>Categorias</h3>
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          <li><Link href="/catalog">Todos os produtos</Link></li>
          {categories.map((category: { id: number; name: string; slug: string }) => (
            <li key={category.id}><Link href={`/catalog?category=${category.slug}`}>{category.name}</Link></li>
          ))}
        </ul>
      </aside>

      <section>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
          {products.map((product: { id: number; name: string; slug: string; price: number; image_url: string | null }) => (
            <article key={product.id} style={{ border: "1px solid #333", borderRadius: 12, padding: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.image_url || "/download.jpg"} alt={product.name} style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 8 }} />
              <h4>{product.name}</h4>
              <p>R$ {Number(product.price).toFixed(2)}</p>
              <Link href={`/product/${product.slug}`}>Comprar</Link>
            </article>
          ))}
        </div>

        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Link href="/catalog" style={{ border: "1px solid #555", borderRadius: 999, padding: "6px 10px" }}>Todos</Link>
          {categories.map((category: { id: number; name: string; slug: string }) => (
            <Link
              key={category.id}
              href={`/catalog?category=${category.slug}`}
              style={{ border: selected === category.slug ? "1px solid #b700ff" : "1px solid #555", borderRadius: 999, padding: "6px 10px" }}
            >
              {category.name}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
