// HomePreview.tsx

"use client";

import Link from "next/link";
import CategoryAutoSelect from "@/app/(components)/CategoryAutoSelect";
import HighlightsCarousel from "@/app/(private)/dashboard/components/HighlightsCarousel";

export interface Product {
  id: number;
  name: string;
  slug: string;
  price: number;
  image_url?: string;
  category_slug?: string;
  category_name?: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
}

interface HomePreviewProps {
  banners: any[];
  highlights: Product[];
  categories: Category[];
  sections: { category: Category; items: Product[] }[];
  isPreview?: boolean;
}

export default function HomePreview({
  banners,
  highlights,
  categories,
  sections,
  isPreview = false,
}: HomePreviewProps) {
  const DisabledLink = ({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: React.ReactNode;
  }) => {
    if (isPreview) {
      return <div className={className}>{children}</div>;
    }

    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  };

  return (
    <main className="homePage">
      {banners.length > 0 && (
        <section className="bannerList">
          {banners.map((banner) => (
            <DisabledLink
              key={banner.id}
              href={banner.link || "#"}
              className="bannerLink"
            >
              <div className="bannerCard">
                <img
                  src={banner.image_url}
                  alt={banner.title}
                  className="bannerImage"
                />

                <div className="bannerContent">
                  <h2>{banner.title}</h2>
                  {banner.subtitle ? <p>{banner.subtitle}</p> : null}
                </div>
              </div>
            </DisabledLink>
          ))}
        </section>
      )}

      <aside className="categoryFilterWrap">
        <div className="categoryFilterBar">
          {!isPreview && (
            <CategoryAutoSelect
              categories={categories.map((c) => ({
                name: c.name,
                slug: c.slug,
              }))}
            />
          )}

          {isPreview && (
            <div className="fakeSelect">
              Categorias ({categories.length})
            </div>
          )}

          <p className="filterHint">
            Selecione uma categoria e você vai direto pro catálogo.
          </p>
        </div>
      </aside>

      {highlights.length > 0 && (
        <section className="highlights">
          <div className="highlightsTop">
            <div className="highlightsTitle">
              <span className="badgeStar">★</span>

              <div>
                <h2>Destaques da Loja</h2>
                <p>Os produtos selecionados pra elevar seu nível.</p>
              </div>
            </div>

            <DisabledLink href="/catalog" className="pillLink">
              Ver catálogo completo ›
            </DisabledLink>
          </div>

          <div className="highlightsRow">
            <HighlightsCarousel highlights={highlights as any} />
          </div>
        </section>
      )}

      {sections.map(({ category, items }) => (
        <section key={category.slug} className="categorySection">
          <div className="categoryHeaderRow">
            <h2 className="categoryTitle">{category.name}</h2>

            <DisabledLink
              href={`/catalog?category=${category.slug}`}
              className="pillLink"
            >
              Ver mais ›
            </DisabledLink>
          </div>

          <div className="productsGrid">
            {items.slice(0, 6).map((product) => (
              <article key={product.id} className="productCard">
                <img
                  src={product.image_url || "/file.svg"}
                  alt={product.name}
                  className="productThumb"
                />

                <span className="productCategory">
                  {product.category_name ?? "Outros"}
                </span>

                <h3 className="productTitle">{product.name}</h3>

                <p className="productPrice">
                  R$ {Number(product.price).toFixed(2)}
                </p>

                <DisabledLink
                  href={`/product/${product.slug}`}
                  className="buyButton"
                >
                  Comprar agora
                </DisabledLink>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}