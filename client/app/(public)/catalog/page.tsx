import Link from "next/link";
import { getDB } from "@/lib/database/db";
import "./catalog.css";

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
    <main className="catalog-main">
      <aside className="catalog-aside">
        <h3>Categorias</h3>
        <ul className="categories-list">
          {/* Classe active se NÃO houver categoria selecionada */}
          <li className={`all ${!selected ? "active-link" : ""}`}>
            <Link href="/catalog">Todos os produtos</Link>
          </li>
          
          {categories.map((category) => (
            <li key={category.id}>
              <Link 
                href={`/catalog?category=${category.slug}`}
                className={selected === category.slug ? "active" : ""}
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section>
        {/* Filtros Mobile */}
        <div className="categories-filter">
          <Link href="/catalog" className={`filter-btn ${!selected ? "active" : ""}`}>
            Todos
          </Link>
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/catalog?category=${category.slug}`}
              className={`filter-btn ${selected === category.slug ? "active" : ""}`}
            >
              {category.name}
            </Link>
          ))}
        </div>

        <div className="products-grid">
          {products.map((product) => (
            <article key={product.id} className="product-card">
              <img src={product.image_url || "/file.svg"} alt={product.name} className="product-image" />
              <h4>{product.name}</h4>
              <p>R$ {Number(product.price).toFixed(2)}</p>
              <Link href={`/product/${product.slug}`}>Comprar</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}