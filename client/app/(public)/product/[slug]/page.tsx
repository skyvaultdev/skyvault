import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getDB } from "@/lib/database/db";
import { buildOgMetadata, absoluteUrl, serializeJsonLd } from "@/lib/seo/buildMetadata";
import { getPublicProduct } from "@/lib/products/getPublicProduct";
import ProductPageClient from "./ProductPageClient";

type Params = { params: Promise<{ slug: string }> };

// cache() deduplica entre generateMetadata e o componente da página — os
// dois rodam no mesmo request e, sem isso, consultariam o banco duas vezes
// pelo mesmo produto.
const loadProduct = cache((slug: string) => getPublicProduct(slug, false));

async function loadStoreName(): Promise<string> {
  const res = await getDB().query(`SELECT store_name FROM store_settings ORDER BY id DESC LIMIT 1`);
  return res.rows[0]?.store_name ?? "Minha Loja";
}

// Metadata roda no servidor (precisa pra gerar o <head> antes do JS
// carregar, inclusive title/OG/canonical pro link compartilhado) — a
// interatividade (galeria, variação, cupom, frete...) continua em
// ProductPageClient.tsx, que recebe os dados iniciais por props em vez de
// buscar tudo de novo no primeiro render.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return { title: "Produto não encontrado" };

  const storeName = await loadStoreName();
  const description = product.description
    ? String(product.description).replace(/\s+/g, " ").trim().slice(0, 200)
    : `R$ ${Number(product.price).toFixed(2).replace(".", ",")} — compre agora.`;
  const path = `/product/${slug}`;

  return {
    ...buildOgMetadata({
      title: product.name,
      description,
      image: product.images[0]?.url ?? null,
      path,
      siteName: storeName,
      type: "article",
    }),
    alternates: { canonical: absoluteUrl(path) },
  };
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();

  const inStock = product.is_unlimited || product.stock_count > 0;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images.length ? product.images.map((img) => absoluteUrl(img.url)) : undefined,
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/product/${slug}`),
      price: Number(product.price).toFixed(2),
      priceCurrency: "BRL",
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <ProductPageClient initialProduct={product} />
    </>
  );
}
