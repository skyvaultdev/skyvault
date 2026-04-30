"use client";

import Link from "next/link";
import { useState } from "react";

import HighlightsCarousel from "@/app/(private)/dashboard/components/HighlightsCarousel";

export interface Product {
  id: number;
  name: string;
  slug: string;
  price: number;
  image_url?: string;
  category_slug?: string;
  category_name?: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
}

interface SectionType {
  category: Category;
  items: Product[];
}

interface HomePreviewProps {
  banners: any[];
  highlights: Product[];
  categories: Category[];
  sections: SectionType[];
  isPreview?: boolean;
}

export default function HomePreview({
  banners,
  highlights,
  categories,
  sections,
  isPreview = false,
}: HomePreviewProps) {
  
  const [localSections, setLocalSections] = useState<SectionType[]>(sections);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedItem, setDraggedItem] = useState<{ slug: string; fromIndex: number } | null>(null);

  const handleDragStart = (e: React.DragEvent, slug: string, index: number) => {
    if (!isPreview) return;
    setDraggedItem({ slug, fromIndex: index });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${slug}-${index}`);
    if (e.dataTransfer.setDragImage) {
      e.dataTransfer.setDragImage(new Image(), 0, 0);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, slug: string, toIndex: number) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.slug !== slug || draggedItem.fromIndex === toIndex) return;

    const newSections = [...localSections];
    const sectionIndex = newSections.findIndex(s => s.category.slug === slug);
    const section = newSections[sectionIndex];
    

    const newItems = [...section.items];
    
    const [removed] = newItems.splice(draggedItem.fromIndex, 1);
    newItems.splice(toIndex, 0, removed);
    
    newSections[sectionIndex] = { ...section, items: newItems };
    setLocalSections(newSections);
    setDraggedItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  async function saveHomeOrder() {
    setIsSaving(true);
    
    const payload = localSections.flatMap((section) =>
      section.items.map((item, index) => ({
        id: item.id,
        position: index + 1,
      }))
    );

    try {
      const response = await fetch("/api/products/order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        alert(`✅ Ordem salva! produtos atualizados.`);
      } else {
        alert("❌ Erro ao salvar.");
      }
    } catch (error) {
      alert("❌ Erro na requisição.");
    } finally {
      setIsSaving(false);
    }
  }

  const DisabledLink = ({ href, className, children }: any) => {
    if (isPreview) {
      return <div className={className} style={{ cursor: 'default' }}>{children}</div>;
    }
    return <Link href={href} className={className}>{children}</Link>;
  };

  return (
    <main className="homePage">
      {isPreview && (
        <div className="savebtnord">
          <button onClick={saveHomeOrder} disabled={isSaving}>
            {isSaving ? "Salvando..." : "💾 Salvar Ordem"}
          </button>
          <span>🖱️ Arraste os produtos para reordenar</span>
        </div>
      )}

      {banners.length > 0 && (
        <section className="bannerList">
          {banners.map((banner) => (
            <DisabledLink key={banner.id} href={banner.link || "#"} className="bannerLink">
              <div className="bannerCard">
                <img src={banner.image_url} alt={banner.title} className="bannerImage" />
                <div className="bannerContent">
                  <h2>{banner.title}</h2>
                  {banner.subtitle && <p>{banner.subtitle}</p>}
                </div>
              </div>
            </DisabledLink>
          ))}
        </section>
      )}

      {highlights.length > 0 && (
        <section className="highlights">
          <div className="highlightsTop">
            <div className="highlightsTitle">
              <span className="badgeStar">★</span>
              <div>
                <h2>Destaques da Loja</h2>
                <p>Os produtos selecionados pra elevar seu nível.</p>
              </div>
            </div>
            <DisabledLink href="/catalog" className="pillLink">Ver catálogo ›</DisabledLink>
          </div>
          <div className="highlightsRow">
            <HighlightsCarousel highlights={highlights as any} />
          </div>
        </section>
      )}

      {localSections.map(({ category, items }) => (
        <section key={category.slug} className="categorySection">
          <div className="categoryHeaderRow">
            <h2 className="categoryTitle">{category.name}</h2>
            <DisabledLink href={`/catalog?category=${category.slug}`} className="pillLink">
              Ver mais ›
            </DisabledLink>
          </div>

          <div 
            className="productsGrid"
            onDragOver={handleDragOver}
          >
            {items.map((product, index) => (
              <div
                key={product.id}
                className="productCard"
                draggable={isPreview}
                onDragStart={(e) => handleDragStart(e, category.slug, index)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, category.slug, index)}
                onDragEnd={handleDragEnd}
                style={{
                  cursor: isPreview ? 'grab' : 'pointer',
                }}
              >
                <img
                  src={product.image_url || "/file.svg"}
                  alt={product.name}
                  className="productThumb"
                />
                <span className="productCategory">
                  {product.category_name ?? "Outros"}
                </span>
                <h3 className="productTitle">{product.name}</h3>
                <p className="productPrice">
                  R$ {Number(product.price).toFixed(2)}
                </p>
                <DisabledLink
                  href={`/product/${product.slug}`}
                  className="buyButton"
                >
                  Comprar agora
                </DisabledLink>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}