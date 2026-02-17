import Link from "next/link";
import { getDB } from "@/lib/database/db";

async function getHomeData() {
  const db = getDB();
  const [banners, products, categories] = await Promise.all([
    db.query("SELECT id,title,subtitle,image_url,link FROM home_banners WHERE active = true ORDER BY position ASC"),
    db.query(`
      SELECT p.id, p.name, p.slug, p.price,
             (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position ASC LIMIT 1) AS image_url
      FROM products p
      WHERE p.active = true
      ORDER BY COALESCE(p.position, 2147483647), p.created_at DESC
      LIMIT 24
    `),
    db.query("SELECT id, name, slug FROM categories ORDER BY name ASC"),
  ]);

  return { banners: banners.rows, products: products.rows, categories: categories.rows };
}

export default async function Home() {
  const { banners, products, categories } = await getHomeData();

  return (
    <main style={{ color: "white", padding: "24px" }}>
      {banners.length > 0 ? (
        <section style={{ display: "grid", gap: 12 }}>
          {banners.map((banner: { id: number; title: string; subtitle: string | null; image_url: string; link: string | null }) => (
            <Link key={banner.id} href={banner.link || "#"} style={{ textDecoration: "none", color: "white" }}>
              <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #333", position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={banner.image_url} alt={banner.title} style={{ width: "100%", maxHeight: 320, objectFit: "cover" }} />
                <div style={{ position: "absolute", left: 16, bottom: 16 }}>
                  <h2>{banner.title}</h2>
                  {banner.subtitle ? <p>{banner.subtitle}</p> : null}
                </div>
              </div>
            </Link>
          ))}
        </section>
      ) : null}

      <aside style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <form action="/catalog" method="get">
          <select name="category" defaultValue="" aria-label="Selecionar categoria" style={{ padding: 8, borderRadius: 8 }}>
            <option value="">Todas categorias</option>
            {categories.map((category: { id: number; name: string; slug: string }) => (
              <option key={category.id} value={category.slug}>{category.name}</option>
            ))}
          </select>
          <button type="submit" style={{ marginLeft: 8 }}>Filtrar</button>
        </form>
      </aside>

      <section style={{ marginTop: 20 }}>
        <h2>Produtos</h2>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
          {products.map((product: { id: number; slug: string; name: string; price: number; image_url: string | null }) => (
            <article key={product.id} style={{ border: "1px solid #333", borderRadius: 12, padding: 12, background: "#050505" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.image_url || "/download.jpg"} alt={product.name} style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 8 }} />
              <h3>{product.name}</h3>
              <p>R$ {Number(product.price).toFixed(2)}</p>
              <Link href={`/product/${product.slug}`}>Ver produto</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
