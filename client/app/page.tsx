import Link from "next/link";
import { getDB } from "@/lib/database/db";
import "./home.css";

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
    <main className="homePage">
      {banners.length > 0 ? (
        <section className="bannerList">
          {banners.map((banner: { id: number; title: string; subtitle: string | null; image_url: string; link: string | null }) => (
            <Link key={banner.id} href={banner.link || "#"} className="bannerLink">
              <div className="bannerCard">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={banner.image_url} alt={banner.title} className="bannerImage" />
                <div className="bannerContent">
                  <h2>{banner.title}</h2>
                  {banner.subtitle ? <p>{banner.subtitle}</p> : null}
                </div>
              </div>
            </Link>
          ))}
        </section>
      ) : null}

      <aside className="categoryFilterWrap">
        <form action="/catalog" method="get" className="categoryFilterForm">
          <select name="category" defaultValue="" aria-label="Selecionar categoria" className="homeSelect">
            <option value="">Todas categorias</option>
            {categories.map((category: { id: number; name: string; slug: string }) => (
              <option key={category.id} value={category.slug}>{category.name}</option>
            ))}
          </select>
          <button type="submit" className="homeButton">Filtrar</button>
        </form>
      </aside>

      <section>
        <h2>Produtos</h2>
        <div className="productsGrid">
          {products.map((product: { id: number; slug: string; name: string; price: number; image_url: string | null }) => (
            <article key={product.id} className="productCard">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.image_url || "/download.jpg"} alt={product.name} className="productThumb" />
              <h3>{product.name}</h3>
              <p>R$ {Number(product.price).toFixed(2)}</p>
              <Link href={`/product/${product.slug}`} className="homeProductLink">Ver produto</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
