import Link from "next/link";
import Icon from "@/components/icons/Icon";
import { getDB } from "@/lib/database/db";
import CategoryAutoSelect from "./(components)/CategoryAutoSelect";
import "./home.css";
import "./home-sections.css";
import HighlightsCarousel from "./(private)/dashboard/components/HighlightsCarousel";
import { loadHomeConfig } from "@/lib/home/loadHomeConfig";
import type { HomeSection } from "@/lib/home/config";

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

type SpotlightProduct = Product & { description: string | null };

async function getHomeData() {
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

async function getSpotlightProducts(ids: number[]) {
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

type HomeData = {
  banners: Banner[];
  categories: Category[];
  highlights: Product[];
  sections: { category: Category; items: Product[] }[];
  spotlight: Map<number, SpotlightProduct>;
};

function str(v: unknown) {
  return String(v ?? "");
}

function renderSection(section: HomeSection, d: HomeData) {
  const data = section.data;

  switch (section.type) {
    case "announcement": {
      if (!str(data.text)) return null;
      const inner = <span>{str(data.text)}</span>;
      return (
        <div key={section.id} className="hsAnnouncement">
          {str(data.link) ? <Link href={str(data.link)}>{inner}</Link> : inner}
        </div>
      );
    }

    case "hero":
      return (
        <section
          key={section.id}
          className={`hsHero ${str(data.align) === "left" ? "left" : ""}`}
          style={
            str(data.imageUrl)
              ? { backgroundImage: `linear-gradient(rgba(5,5,5,.72), rgba(5,5,5,.72)), url("${str(data.imageUrl).replace(/["\()\s]/g, (c) => "%" + c.charCodeAt(0).toString(16))}")` }
              : undefined
          }
        >
          {str(data.badge) && <span className="hsBadge">{str(data.badge)}</span>}
          <h1>{str(data.title)}</h1>
          {str(data.subtitle) && <p>{str(data.subtitle)}</p>}
          {str(data.buttonText) && (
            <Link href={str(data.buttonLink) || "/catalog"} className="hsButton">
              {str(data.buttonText)}
            </Link>
          )}
        </section>
      );

    case "banners": {
      const slides = ((data.slides as Record<string, string>[]) ?? []).filter((s) => s.mediaUrl);
      if (slides.length > 0) {
        return (
          <section key={section.id} className={`hsSlides ${slides.length === 1 ? "single" : ""}`}>
            {slides.map((s, i) => {
              const media = s.kind === "video"
                ? <video className="hsSlideMedia" src={s.mediaUrl} autoPlay muted loop playsInline preload="metadata" />
                : <img className="hsSlideMedia" src={s.mediaUrl} alt={s.title || "Banner"} />;
              const body = (
                <>
                  {media}
                  {(s.title || s.subtitle) && (
                    <div className="hsSlideText">
                      {s.title && <h2>{s.title}</h2>}
                      {s.subtitle && <p>{s.subtitle}</p>}
                    </div>
                  )}
                </>
              );
              return s.link
                ? <Link key={i} href={s.link} className="hsSlide">{body}</Link>
                : <div key={i} className="hsSlide">{body}</div>;
            })}
          </section>
        );
      }
      // Banners antigos (tabela home_banners): só aparecem enquanto a seção não tiver banners próprios.
      return d.banners.length > 0 ? (
        <section key={section.id} className="bannerList">
          {d.banners.map((banner) => (
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
      ) : null;
    }

    case "stats": {
      const items = (data.items as { value: string; label: string }[]) ?? [];
      if (items.length === 0) return null;
      return (
        <section key={section.id} className="hsStats">
          {items.map((it, i) => (
            <div key={i} className="hsStat">
              <strong>{it.value}</strong>
              <span>{it.label}</span>
            </div>
          ))}
        </section>
      );
    }

    case "spotlight": {
      const p = d.spotlight.get(Number(data.productId));
      if (!p) return null;
      const blurb = str(data.subtitle) || (p.description ? String(p.description).slice(0, 160) : "");
      return (
        <section key={section.id} className="hsSpotlight">
          <div className="hsSpotlightText">
            {str(data.badge) && <span className="hsBadge">{str(data.badge)}</span>}
            <h2>{str(data.title) || p.name}</h2>
            {blurb && <p>{blurb}</p>}
            <p className="hsPrice">
              Comece com apenas <strong>R$ {Number(p.price).toFixed(2).replace(".", ",")}</strong>
            </p>
            {str(data.couponCode) && (
              <p className="hsCoupon">
                <code>{str(data.couponCode)}</code> {str(data.couponText)}
              </p>
            )}
            <Link href={`/product/${p.slug}`} className="hsButton">
              {str(data.buttonText) || "Comprar agora"}
            </Link>
          </div>
          <img src={p.image_url || "/placeholders/product.svg"} alt={p.name} className="hsSpotlightImg" />
        </section>
      );
    }

    case "categories": {
      if (d.categories.length === 0) return null;
      if (str(data.style) === "select") {
        return (
          <aside key={section.id} className="categoryFilterWrap">
            <div className="categoryFilterBar">
              <CategoryAutoSelect categories={d.categories.map((c) => ({ name: c.name, slug: c.slug }))} />
              <p className="filterHint">Selecione uma categoria e você vai direto pro catálogo.</p>
            </div>
          </aside>
        );
      }
      return (
        <section key={section.id} className="hsCategories">
          {str(data.title) && <h2>{str(data.title)}</h2>}
          <div className="hsCategoryGrid">
            {d.categories.map((c) => (
              <Link key={c.id} href={`/catalog?category=${encodeURIComponent(c.slug)}`} className="hsCategoryCard">
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      );
    }

    case "highlights":
      return d.highlights.length > 0 ? (
        <section key={section.id} className="highlights">
          <div className="highlightsTop">
            <div className="highlightsTitle">
              <span className="badgeStar"><Icon name="star" fill /></span>
              <div>
                <h2>Destaques da Loja</h2>
                <p>Os produtos mais cobiçados e exclusivos, selecionados pra elevar seu nível.</p>
              </div>
            </div>

            <Link className="pillLink" href="/catalog">
              <p>Ver catálogo completo</p> <span aria-hidden="true">›</span>
            </Link>
          </div>

          <div className="highlightsRow">
            <HighlightsCarousel highlights={d.highlights} />
          </div>
        </section>
      ) : null;

    case "catalog":
      return (
        <div key={section.id}>
          {d.sections.map(({ category, items }) => (
            <section key={category.slug} className="categorySection">
              <div className="categoryHeaderRow">
                <h2 className="categoryTitle">{category.name}</h2>
                <Link
                  className="pillLink2"
                  href={category.id === 0 ? "/catalog" : `/catalog?category=${encodeURIComponent(category.slug)}`}
                >
                  <p className="pillLinkText">Ver mais</p> <span aria-hidden="true">›</span>
                </Link>
              </div>

              <div className="productsGrid">
                {items.slice(0, Number(data.perCategory) || 6).map((product) => (
                  <Link href={`/product/${product.slug}`} key={product.id} className="productCard">
                    <article className="">
                      <img src={product.image_url || "/placeholders/product.svg"} alt={product.name} className="productThumb" />
                      <span className="productCategory">{product.category_name ?? "Outros"}</span>
                      <h3 className="productTitle">{product.name}</h3>
                      <p className="productCardPrice">R$ {Number(product.price).toFixed(2)}</p>
                      <span className="buyButton">Comprar Agora</span>
                    </article>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      );

    case "faq": {
      const items = ((data.items as { q: string; a: string }[]) ?? []).filter((i) => i.q);
      if (items.length === 0) return null;
      return (
        <section key={section.id} className="hsFaq">
          <h2>{str(data.title) || "Perguntas frequentes"}</h2>
          {items.map((it, i) => (
            <details key={i} className="hsFaqItem">
              <summary>{it.q}</summary>
              <p>{it.a}</p>
            </details>
          ))}
        </section>
      );
    }

    case "social": {
      const links = [
        { label: "Discord", url: str(data.discord) },
        { label: "YouTube", url: str(data.youtube) },
        { label: "Instagram", url: str(data.instagram) },
        { label: "WhatsApp", url: str(data.whatsapp) },
      ].filter((l) => l.url);
      if (links.length === 0) return null;
      return (
        <section key={section.id} className="hsSocial">
          {str(data.title) && <h2>{str(data.title)}</h2>}
          <div className="hsSocialRow">
            {links.map((l) => (
              <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="hsSocialBtn">
                {l.label}
              </a>
            ))}
          </div>
        </section>
      );
    }

    default:
      return null;
  }
}

export default async function Home() {
  const [{ banners, categories, products }, config] = await Promise.all([getHomeData(), loadHomeConfig()]);
  const highlights = products.slice(0, 5);
  const uncategorizedItems: Product[] = [];

  const map = new Map<string, { category: Category; items: Product[] }>();
  for (const c of categories) map.set(c.slug, { category: c, items: [] });

  for (const p of products) {
    const key = p.category_slug;
    if (!key) {
      uncategorizedItems.push(p);
      continue;
    }
    const bucket = map.get(key);
    if (bucket) bucket.items.push(p);
  }

  const sections = [...map.values()].filter((b) => b.items.length > 0);
  if (uncategorizedItems.length > 0) {
    sections.push({ category: { id: 0, name: "Outros", slug: "outros" }, items: uncategorizedItems });
  }

  const spotlightIds = config.sections
    .filter((s) => s.enabled && s.type === "spotlight")
    .map((s) => Number(s.data.productId))
    .filter((n) => n > 0);
  const spotlight = await getSpotlightProducts(spotlightIds);

  const data: HomeData = { banners, categories, highlights, sections, spotlight };

  return (
    <main className="homePage">
      {config.sections.filter((s) => s.enabled).map((s) => renderSection(s, data))}
    </main>
  );
}
