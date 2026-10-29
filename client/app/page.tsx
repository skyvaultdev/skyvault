import "./home.css";
import "./home-sections.css";
import { loadHomeConfig } from "@/lib/home/loadHomeConfig";
import { buildCategorySections, getHomeData, getSpotlightProducts } from "@/lib/home/homeData";
import { renderHomeSection, type HomeData } from "@/lib/home/renderHomeSection";

export default async function Home() {
  const [{ banners, categories, products }, config] = await Promise.all([getHomeData(), loadHomeConfig()]);
  const highlights = products.slice(0, 5);
  const sections = buildCategorySections(categories, products);

  const spotlightIds = config.sections
    .filter((s) => s.enabled && s.type === "spotlight")
    .map((s) => Number(s.data.productId))
    .filter((n) => n > 0);
  const spotlight = await getSpotlightProducts(spotlightIds);

  const data: HomeData = { banners, categories, highlights, sections, spotlight };

  return (
    <main className="homePage">
      {config.sections.filter((s) => s.enabled).map((s) => renderHomeSection(s, data))}
    </main>
  );
}
