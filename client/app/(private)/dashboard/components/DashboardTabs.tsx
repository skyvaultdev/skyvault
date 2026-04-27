"use client";

import "./components.css";
import "./stocktabs.css";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardTab } from "./Sidebar";
import Link from "next/link";

type Variation = {
  id: number;
  name: string;
  price: number;
  stock_count: number;
  stock_type: 'key' | 'file' | 'infinite';
  is_unlimited: boolean;
}

type ProductItem = {
  id: number;
  name: string;
  slug?: string;
  position?: number | null;
  variations: Variation[];
  stock_type?: 'key' | 'file' | 'infinite';
  stock_count?: number;
  image_url?: string;
};

type AdminItem = {
  id: number;
  email: string;
};

type StoreSettings = {
  primaryColor: string;
  secondaryColor: string;
  backgroundType: "lines" | "dots";
  backgroundCss: string;
  backgroundImageUrl: string;
};

type DashboardTabsProps = {
  selectedTab: DashboardTab;
  previewProducts: ProductItem[];
  colorTarget: "primary" | "secondary";
  selectedColor: string;
  onChangeColorTarget: (target: "primary" | "secondary") => void;
  onChangeSelectedColor: (value: string) => void;
  onSaveColors: () => Promise<void>;
  storeSettings: StoreSettings;
  onBackgroundTypeChange: (type: "lines" | "dots") => void;
  onBackgroundCssChange: (css: string) => void;
  onBackgroundImageChange: (file: File | null) => void;
  onSaveBackground: () => Promise<void>;
  orderedProducts: ProductItem[];
  onDragStart: (id: number) => void;
  onDrop: (id: number) => void;
  onSavePositions: () => Promise<void>;
  admins: AdminItem[];
  onAddAdmin?: (email: string) => Promise<void>;
  onRemoveAdmin?: (id: number) => Promise<void>;
};

export default function DashboardTabs(props: DashboardTabsProps) {
  const {
    selectedTab,
    previewProducts,
    colorTarget,
    selectedColor,
    onChangeColorTarget,
    onChangeSelectedColor,
    onSaveColors,
    storeSettings,
    onBackgroundTypeChange,
    onBackgroundCssChange,
    onBackgroundImageChange,
    onSaveBackground,
    orderedProducts,
    onDragStart,
    onDrop,
    onSavePositions,
    admins,
  } = props;

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [openVariationId, setOpenVariationId] = useState<number | null>(null);
  
  const itemsPerPage = 12;
  const router = useRouter();

  const filteredProducts = useMemo(() => {
    return orderedProducts.filter((product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.slug?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [orderedProducts, searchTerm]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage]);

  const manageStock = (productId: any) => {
    router.push(`/dashboard/stock/manage/${productId}`);
  };

  const pageNumbers = Array.from({ length: totalPages}, (_, i) => i + 1);
  const previewCards = useMemo(() => previewProducts.slice(0, 4), [previewProducts]);

  if (selectedTab === "estoque") {
    return (
      <section className="settingsPanel">
        <div className="tabHeader">
          <h3>Gerenciar Estoque</h3>
          <p className="helperText">Configure a entrega de keys, arquivos ou estoque infinito para cada produto.</p>
        </div>

        <div className="searchContainer">
          <input
            type="text"
            placeholder="Buscar por nome ou slug..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="searchInput"
          />
        </div>

        <div className="inventoryGrid">
          {paginatedProducts.map((product) => {
            const isMenuOpen = openVariationId === product.id;

            return (
              <div key={product.id} className="inventoryCard">
                <div className="productImagePreview">
                  <Link href={`/product/${product.slug}`}>
                    <img
                      src={product.image_url || "/file.svg"}
                      alt={product.name}
                      className="stockProductImg"
                    />
                  </Link>
                </div>
                <div className="productInfoCell">
                  <strong>{product.name}</strong>
                  <span className="stockQtyInline">
                    ({product.stock_type === 'infinite' ? '∞' : (product.stock_count ?? 0)})
                  </span>
                </div>

                <div className="infoProd">
                  <div className="slug">• {product.slug}</div>
                  <div className="tipo">• {
                    product.stock_type === 'key' ? `Keys` :
                    product.stock_type === 'file' ? 'Arquivo' :
                    product.stock_type === 'infinite' ? 'Ilimitado' : 'Sem estoque'
                  }</div>
                  
                  {product.variations.length > 0 && (
                    <button
                      type="button"
                      className="variationhead"
                      onClick={() => setOpenVariationId(isMenuOpen ? null : product.id)}
                    >
                      Variações {isMenuOpen ? '▲' : '▼'}
                    </button>
                  )}

                  {isMenuOpen && (
                    <div className="variações">
                      {product.variations.map((v) => (
                        <div className="variação" key={v.id}>
                          {v.name} ({v.is_unlimited ? '∞' : v.stock_count})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="cardActions">
                  <button className="btnEditSmall" onClick={() => manageStock(product.slug)}>
                    ⚙️ Configurar
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button 
              disabled={currentPage === 1} 
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="btnPagination"
            >
              &larr;
            </button>
           {pageNumbers.map((num) => (
            <button
              key={num}
              onClick={() => setCurrentPage(num)}
              className={`pageNumber ${currentPage === num ? "active" : ""} btnPagination`}
              > {num} 
            </button>
           ))}

          </div>
        )}

        {filteredProducts.length === 0 && (
          <p className="emptyMsg">Nenhum produto encontrado.</p>
        )}
      </section>
    );
  }

  if (selectedTab === "inicio") {
    return (
      <section className="settingsPanel">
        <h3>Prévia da Home</h3>
        <div className="previewBanner">Banner principal da loja</div>
        <div className="previewGrid">
          {previewCards.map((product) => (
            <article key={product.id} className="previewCard">
              <strong>{product.name}</strong>
              <span>ID: {product.id}</span>
            </article>
          ))}
          {previewCards.length === 0 && <p>Nenhum produto disponível para prévia.</p>}
        </div>
      </section>
    );
  }

  if (selectedTab === "cores") {
    return (
      <section className="settingsPanel">
        <h3>Cores da loja</h3>
        <label className="fieldLabel" htmlFor="color-target">Grupo de cor</label>
        <select
          id="color-target"
          value={colorTarget ?? "primary"}
          onChange={(event) => onChangeColorTarget(event.target.value as "primary" | "secondary")}
          className="settingsInput"
        >
          <option value="primary">Primária</option>
          <option value="secondary">Secundária</option>
        </select>
        <label className="fieldLabel" htmlFor="color-picker">Selecionar cor</label>
        <input
          id="color-picker"
          type="color"
          value={selectedColor ?? "#b700ff"}
          onChange={(event) => onChangeSelectedColor(event.target.value)}
          className="colorPicker"
        />
        <button className="btn" type="button" onClick={() => void onSaveColors()}>
          Salvar cores
        </button>
      </section>
    );
  }

  if (selectedTab === "background") {
    return (
      <section className="settingsPanel">
        <h3>Background</h3>
        <label className="radioRow">
          <input
            type="radio"
            checked={(storeSettings.backgroundType ?? "lines") === "lines"}
            onChange={() => onBackgroundTypeChange("lines")}
          />
          Linhas
        </label>
        <label className="radioRow">
          <input
            type="radio"
            checked={(storeSettings.backgroundType ?? "lines") === "dots"}
            onChange={() => onBackgroundTypeChange("dots")}
          />
          Pontos
        </label>
        <label className="fieldLabel" htmlFor="background-image">Upload de imagem</label>
        <input
          id="background-image"
          type="file"
          accept="image/*"
          onChange={(event) => onBackgroundImageChange(event.target.files?.[0] ?? null)}
          className="settingsInput"
        />
        <label className="fieldLabel" htmlFor="background-css">CSS customizado</label>
        <textarea
          id="background-css"
          value={storeSettings.backgroundCss ?? ""}
          onChange={(event) => onBackgroundCssChange(event.target.value)}
          className="settingsTextarea"
          rows={4}
        />
        <button className="btn" type="button" onClick={() => void onSaveBackground()}>
          Salvar background
        </button>
      </section>
    );
  }

  if (selectedTab === "posicao") {
    return (
      <section className="settingsPanel">
        <h3>Posição dos produtos</h3>
        <div className="sortableList">
          {orderedProducts.map((product) => (
            <div
              key={product.id}
              draggable
              onDragStart={() => onDragStart(product.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(product.id)}
              className="sortableItem"
            >
              {product.name}
            </div>
          ))}
        </div>
        <button className="btn" type="button" onClick={() => void onSavePositions()}>
          Salvar ordem
        </button>
      </section>
    );
  }

  return (
    <section className="settingsPanel">
      <h3>Equipe</h3>
      <table className="teamTable">
        <thead>
          <tr>
            <th>ID</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {admins.map((admin) => (
            <tr key={admin.id}>
              <td>{admin.id}</td>
              <td>{admin.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {admins.length === 0 && <p>Nenhum admin encontrado.</p>}
    </section>
  );
}