import Link from "next/link";
import { getDB } from "@/lib/database/db";
import CategoryAutoSelect from "./(components)/CategoryAutoSelect"; 
import "./home.css";

type Category = { id: number; name: string; slug: string };
type Banner = { id: number; title: string; subtitle: string | null; image_url: string; link: string | null };

type Product = {
  id: number;
  name: string;
  slug: string;
  price: number;
  image_url: string | null;
  category_name: string | null;
  category_slug: string | null;
};

async function getHomeData() {
  const db = getDB();

  const [bannersRes, categoriesRes, productsRes] = await Promise.all([
    db.query<Banner>("SELECT id,title,subtitle,image_url,link FROM home_banners WHERE active = true ORDER BY position ASC"),
    db.query<Category>("SELECT id, name, slug FROM categories ORDER BY name ASC"),
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

export default async function Home() {
  const { banners, categories, products } = await getHomeData();

  const highlights = products.slice(0, 3);

 
  const map = new Map<string, { category: Category; items: Product[] }>();
  for (const c of categories) map.set(c.slug, { category: c, items: [] });

  for (const p of products) {
    const key = p.category_slug ?? "";
    if (!key) continue;
    const bucket = map.get(key);
    if (bucket) bucket.items.push(p);
  }

  const sections = [...map.values()].filter((b) => b.items.length > 0);

  return (
    <main className="homePage">
      {banners.length > 0 ? (
        <section className="bannerList">
          {banners.map((banner) => (
            <Link key={banner.id} href={banner.link || "#"} className="bannerLink">
              <div className="bannerCard">
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
        <div className="categoryFilterBar">
          <CategoryAutoSelect categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />
          <p className="filterHint">Selecione uma categoria e você vai direto pro catálogo.</p>
        </div>
      </aside>

      
      {highlights.length > 0 ? (
        <section className="highlights">
          <div className="highlightsTop">
            <div className="highlightsTitle">
              <span className="badgeStar">★</span>
              <div>
                <h2>Destaques da Loja</h2>
                <p>Os produtos mais cobiçados e exclusivos, selecionados pra elevar seu nível.</p>
              </div>
            </div>

            <Link className="pillLink" href="/catalog">
              Ver catálogo completo <span aria-hidden="true">›</span>
            </Link>
          </div>

          <div className="highlightsRow">
            {highlights.map((product) => (
              <article key={product.id} className="highlightCard">
            
                <img
                  src={product.image_url || "/download.jpg"}
                  alt={product.name}
                  className="highlightImage"
                />
                <div className="highlightOverlay">
                  <div className="highlightMeta">
                    <span className="productCategory">{product.category_name ?? "Sem categoria"}</span>
                    <h3 className="productTitle">{product.name}</h3>
                    <p className="productPrice">R$ {Number(product.price).toFixed(2)}</p>
                  </div>

                  <Link href={`/product/${product.slug}`} className="buyButton">
                    Comprar agora
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

  
      {sections.map(({ category, items }) => (
        <section key={category.slug} className="categorySection">
          <div className="categoryHeaderRow">
            <h2 className="categoryTitle">{category.name}</h2>
            <Link className="pillLink" href={`/catalog?category=${encodeURIComponent(category.slug)}`}>
              Ver mais <span aria-hidden="true">›</span>
            </Link>
          </div>

          <div className="productsGrid">
            {items.slice(0, 6).map((product) => (
              <article key={product.id} className="productCard">
              
                <img
                  src={product.image_url || "/download.jpg"}
                  alt={product.name}
                  className="productThumb"
                />

                <span className="productCategory">{product.category_name ?? "Sem categoria"}</span>

                <h3 className="productTitle">{product.name}</h3>
                <p className="productPrice">R$ {Number(product.price).toFixed(2)}</p>

                <Link href={`/product/${product.slug}`} className="buyButton">
                  Comprar agora
                </Link>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}