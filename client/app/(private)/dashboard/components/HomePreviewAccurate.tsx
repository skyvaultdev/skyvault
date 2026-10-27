"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/icons/Icon";
import { useModal } from "@/app/(components)/modal/ModalProvider";
import { renderHomeSection, type Category, type HomeData, type Product } from "@/lib/home/renderHomeSection";
import type { HomeConfig } from "@/lib/home/config";
import "@/app/home.css";
import "@/app/home-sections.css";

type CategorySection = { category: Category; items: Product[] };

// Prévia fiel da home: usa o MESMO renderHomeSection que a home de verdade
// (app/page.tsx), na mesma ordem/seções do home_config atual — a única
// diferença é a seção "catalog", que aqui vira arrastável pra reordenar os
// produtos dentro de cada categoria (mesmas classes CSS, só com handlers a mais).
export default function HomePreviewAccurate({ refreshKey = 0 }: { refreshKey?: number }) {
  const modal = useModal();
  const [config, setConfig] = useState<HomeConfig | null>(null);
  const [data, setData] = useState<HomeData | null>(null);
  const [localSections, setLocalSections] = useState<CategorySection[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragged, setDragged] = useState<{ categorySlug: string; index: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/home-preview-data", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) {
        const spotlight = new Map<number, Product & { description: string | null }>();
        for (const p of json.data.spotlight ?? []) spotlight.set(Number(p.id), p);
        setConfig(json.data.config);
        setData({
          banners: json.data.banners,
          categories: json.data.categories,
          highlights: json.data.highlights,
          sections: json.data.sections,
          spotlight,
        });
        setLocalSections(json.data.sections ?? []);
        setDirty(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  function drop(categorySlug: string, toIndex: number) {
    if (!dragged || dragged.categorySlug !== categorySlug || dragged.index === toIndex) return;
    setLocalSections((prev) =>
      prev.map((s) => {
        if (s.category.slug !== categorySlug) return s;
        const items = [...s.items];
        const [moved] = items.splice(dragged.index, 1);
        items.splice(toIndex, 0, moved);
        return { ...s, items };
      })
    );
    setDragged({ categorySlug, index: toIndex });
    setDirty(true);
  }

  async function saveOrder() {
    setSaving(true);
    try {
      const payload = localSections.flatMap((s) => s.items.map((item, index) => ({ id: item.id, position: index + 1 })));
      const res = await fetch("/api/products/order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setDirty(false);
        await modal.alert("Ordem dos produtos salva!");
      } else {
        await modal.alert("Erro ao salvar a ordem.");
      }
    } finally {
      setSaving(false);
    }
  }

  function renderCatalog(key: string, perCategory: number) {
    return (
      <div key={key}>
        {localSections.map(({ category, items }) => (
          <section key={category.slug} className="categorySection">
            <div className="categoryHeaderRow">
              <h2 className="categoryTitle">{category.name}</h2>
              <span className="pillLinkText">Ver mais ›</span>
            </div>
            <div className="productsGrid">
              {items.slice(0, perCategory || 6).map((product, index) => (
                <div
                  key={product.id}
                  className="productCard"
                  draggable
                  onDragStart={(e) => { setDragged({ categorySlug: category.slug, index }); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { if (dragged) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); drop(category.slug, index); }}
                  onDragEnd={() => setDragged(null)}
                  style={{ cursor: "grab" }}
                  title="Arraste para reordenar"
                >
                  <article>
                    <img src={product.image_url || "/placeholders/product.svg"} alt={product.name} className="productThumb" />
                    <span className="productCategory">{product.category_name ?? "Outros"}</span>
                    <h3 className="productTitle">{product.name}</h3>
                    <p className="productCardPrice">R$ {Number(product.price).toFixed(2)}</p>
                    <span className="buyButton">Comprar Agora</span>
                  </article>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (loading || !config || !data) return <div className="previewPlaceholder">Carregando visualização...</div>;

  return (
    <div className="homePreviewWrapper">
      <div className="browserToolbar"></div>
      <div className="previewScrollContainer">
        <div className="previewRealSize">
          <main className="homePage">
            {config.sections.filter((s) => s.enabled).map((s) =>
              s.type === "catalog" ? renderCatalog(s.id, Number(s.data.perCategory) || 6) : renderHomeSection(s, { ...data, sections: localSections })
            )}
          </main>
        </div>
      </div>
      {dirty && (
        <div className="savebtnord">
          <button className="btn" disabled={saving} onClick={() => void saveOrder()}>
            <Icon name="save" /> {saving ? "Salvando..." : "Salvar ordem dos produtos"}
          </button>
        </div>
      )}
    </div>
  );
}
