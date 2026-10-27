import Link from "next/link";
import Icon from "@/components/icons/Icon";
import CategoryAutoSelect from "@/app/(components)/CategoryAutoSelect";
import HighlightsCarousel from "@/app/(private)/dashboard/components/HighlightsCarousel";
import type { HomeSection } from "@/lib/home/config";

// Renderizador de seção único, usado tanto pela home de verdade
// (app/page.tsx, servidor) quanto pela prévia da dashboard (cliente) — as
// duas SEMPRE mostram exatamente o mesmo HTML pro mesmo home_config.

export type Category = { id: number; name: string; slug: string };
export type Banner = { id: number; title: string; subtitle: string | null; image_url: string; link: string | null };
export type Product = {
  id: number;
  name: string;
  slug: string;
  price: number;
  image_url: string | null;
  category_name: string | null;
  category_slug: string | null;
};
export type SpotlightProduct = Product & { description: string | null };

export type HomeData = {
  banners: Banner[];
  categories: Category[];
  highlights: Product[];
  sections: { category: Category; items: Product[] }[];
  spotlight: Map<number, SpotlightProduct>;
};

export function str(v: unknown) {
  return String(v ?? "");
}

export function renderHomeSection(section: HomeSection, d: HomeData) {
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

    case "hero": {
      const mediaUrl = str(data.imageUrl);
      const isVideo = str(data.mediaKind) === "video" && !!mediaUrl;
      return (
        <section key={section.id} className={`hsHero ${str(data.align) === "left" ? "left" : ""} ${isVideo ? "hasVideo" : ""}`}>
          {isVideo && <video className="hsHeroVideo" src={mediaUrl} autoPlay muted loop playsInline preload="metadata" />}
          {!isVideo && mediaUrl && <div className="hsHeroImage" style={{ backgroundImage: `url("${mediaUrl.replace(/["\\()\s]/g, (c) => "%" + c.charCodeAt(0).toString(16))}")` }} />}
          {mediaUrl && <div className="hsHeroScrim" />}
          <div className="hsHeroContent">
            {str(data.badge) && <span className="hsBadge">{str(data.badge)}</span>}
            <h1>{str(data.title)}</h1>
            {str(data.subtitle) && <p>{str(data.subtitle)}</p>}
            {str(data.buttonText) && (
              <Link href={str(data.buttonLink) || "/catalog"} className="hsButton">
                {str(data.buttonText)}
              </Link>
            )}
          </div>
        </section>
      );
    }

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

    case "testimonials": {
      const items = ((data.items as { quote: string; author: string; role?: string }[]) ?? []).filter((i) => i.quote);
      if (items.length === 0) return null;
      return (
        <section key={section.id} className="hsTestimonials">
          {str(data.title) && <h2>{str(data.title)}</h2>}
          <div className="hsTestimonialsRow">
            {items.map((it, i) => (
              <blockquote key={i} className="hsTestimonial">
                <p>&ldquo;{it.quote}&rdquo;</p>
                <footer>
                  <strong>{it.author || "Cliente"}</strong>
                  {it.role && <span>{it.role}</span>}
                </footer>
              </blockquote>
            ))}
          </div>
        </section>
      );
    }

    case "cta": {
      if (!str(data.title)) return null;
      return (
        <section key={section.id} className="hsCta">
          <div>
            <h2>{str(data.title)}</h2>
            {str(data.subtitle) && <p>{str(data.subtitle)}</p>}
          </div>
          {str(data.buttonText) && (
            <Link href={str(data.buttonLink) || "/catalog"} className="hsButton">
              {str(data.buttonText)}
            </Link>
          )}
        </section>
      );
    }

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
