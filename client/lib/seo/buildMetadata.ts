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

// JSON.stringify NÃO escapa "<", ">" nem "&" — um JSON-LD montado com
// texto vindo do banco (nome/descrição de produto, editável por qualquer
// staff com products.write) pode fechar a tag <script> cedo e injetar
// outro <script> no meio, rodando no navegador de QUALQUER visitante da
// página (XSS armazenado, sem precisar estar logado). </>/&
// são sequências válidas dentro de uma string JSON e o parser de JSON-LD
// as decodifica normalmente — só o HTML bruto que não as interpreta como
// abertura/fechamento de tag.
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
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
