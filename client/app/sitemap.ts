import type { MetadataRoute } from "next";
import { getDB } from "@/lib/database/db";
import { absoluteUrl } from "@/lib/seo/buildMetadata";

// Dinâmico por loja: getDB() resolve o tenant pelo Host da requisição
// (mesmo mecanismo de qualquer outra rota — ver lib/tenant/tenantContext.ts),
// então cada loja (subdomínio/domínio próprio) recebe o sitemap só com os
// próprios produtos/categorias.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDB();

  const [products, categories] = await Promise.all([
    db.query(`SELECT slug, created_at FROM products WHERE active = true AND slug IS NOT NULL`),
    db.query(`SELECT slug FROM categories WHERE slug IS NOT NULL`),
  ]);

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/catalog"), changeFrequency: "daily", priority: 0.8 },
  ];

  for (const row of categories.rows) {
    entries.push({ url: absoluteUrl(`/search/${row.slug}`), changeFrequency: "weekly", priority: 0.6 });
  }

  for (const row of products.rows) {
    entries.push({
      url: absoluteUrl(`/product/${row.slug}`),
      lastModified: row.created_at ? new Date(row.created_at) : undefined,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  return entries;
}
