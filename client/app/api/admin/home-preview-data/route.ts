"use server";

import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { loadHomeConfig } from "@/lib/home/loadHomeConfig";
import { buildCategorySections, getHomeData, getSpotlightProducts } from "@/lib/home/homeData";

// Mesmos dados que a home de verdade usa (app/page.tsx), servidos como JSON
// pra prévia da dashboard poder renderizar com o MESMO renderHomeSection e
// ficar fiel ao que o cliente final vê.
export async function GET() {
  try {
    const { denied } = await requirePermission("store.customize");
    if (denied) return denied;

    const [{ banners, categories, products }, config] = await Promise.all([getHomeData(), loadHomeConfig()]);
    const highlights = products.slice(0, 5);
    const sections = buildCategorySections(categories, products);

    const spotlightIds = config.sections
      .filter((s) => s.enabled && s.type === "spotlight")
      .map((s) => Number(s.data.productId))
      .filter((n) => n > 0);
    const spotlightMap = await getSpotlightProducts(spotlightIds);

    return ok({
      banners,
      categories,
      products,
      highlights,
      sections,
      spotlight: Array.from(spotlightMap.values()),
      config,
    });
  } catch (error) {
    console.error("Erro ao montar prévia da home:", error);
    return fail("HOME_PREVIEW_DATA_ERROR", 500);
  }
}
