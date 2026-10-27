import type { Metadata } from "next";
import { config } from "@/config/configuration";

// Monta OG/Twitter Card consistentes — é isso que dá o "embed bem
// trabalhado" quando o link da loja ou de um produto é colado em algum
// lugar (Discord, WhatsApp, X...): title, description, imagem e url
// absolutas, sempre no mesmo formato.
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  try {
    return new URL(pathOrUrl, config.WEBSITE_URL).toString();
  } catch {
    return pathOrUrl;
  }
}

export function buildOgMetadata(params: {
  title: string;
  description: string;
  image?: string | null;
  path: string;
  siteName: string;
  type?: "website" | "article";
}): Metadata {
  const { title, description, image, path, siteName, type = "website" } = params;
  const url = absoluteUrl(path);
  const images = image ? [{ url: absoluteUrl(image) }] : undefined;

  return {
    title,
    description,
    openGraph: {
      type,
      siteName,
      title,
      description,
      url,
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      images: images?.map((i) => i.url),
    },
  };
}
