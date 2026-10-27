import type { MetadataRoute } from "next";
import { config } from "@/config/configuration";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/dev", "/api", "/checkout", "/profile", "/orders", "/reseller"],
    },
    sitemap: `${config.WEBSITE_URL}/sitemap.xml`,
  };
}
