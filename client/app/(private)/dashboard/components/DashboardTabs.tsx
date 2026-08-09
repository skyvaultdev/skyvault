"use client";

import "./components.css";
import "./stocktabs.css";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type BackgroundType =
  | "lines"
  | "dots"
  | "grid"
  | "diagonal"
  | "cyber"
  | "skulls"
  | "heroicons"
  | "none";

type StoreSettings = {
  primaryColor: string;
  secondaryColor: string;
  backgroundType: BackgroundType;
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
  // Widened to match the full set of background options the store actually
  // supports (previously only allowed "lines" | "dots").
  onBackgroundTypeChange: (type: BackgroundType) => void;
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

const BACKGROUND_OPTIONS: { value: BackgroundType; label: string }[] = [
  { value: "lines", label: "Linhas" },
  { value: "dots", label: "Pontos" },
  { value: "grid", label: "Grade" },
  { value: "diagonal", label: "Diagonal" },
  { value: "cyber", label: "Cyber" },
  { value: "skulls", label: "Caveiras" },
  { value: "heroicons", label: "Heroicons" },
  { value: "none", label: "Nenhum" },
];

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

  const itemsPerPage = 8;
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

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  // Reset to page 1 when the search term changes or the underlying product
  // count changes (e.g. after a reload), so the user never lands on a page
  // that no longer has any items. Keyed off `.length` rather than the array
  // reference so a simple reorder (same length) doesn't reset the page.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, orderedProducts.length]);

  // Close any open variation dropdown when the page changes, since the
  // product it belongs to may no longer be visible.
  useEffect(() => {
    setOpenVariationId(null);
  }, [currentPage]);

  const handleManageStock = useCallback((slug?: string) => {
    if (!slug) return;
    router.push(`/dashboard/stock/manage/${slug}`);
  }, [router]);

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
            onChange={(e) => setSearchTerm(e.target.value)}
            className="searchInput"
          />
        </div>

        <div className="inventoryGrid">
          {paginatedProducts.map((product) => {
            const isMenuOpen = openVariationId === product.id;

            return (
              <div key={product.id} className="inventoryCard">
                <div className="productImagePreview">
                  {product.slug ? (
                    <Link href={`/product/${product.slug}`}>
                      <img
                        src={product.image_url || "/file.svg"}
                        alt={product.name}
                        className="stockProductImg"
                      />
                    </Link>
                  ) : (
                    <img
                      src={product.image_url || "/file.svg"}
                      alt={product.name}
                      className="stockProductImg"
                    />
                  )}
                </div>
                <div className="productInfoCell">
                  <strong>{product.name}</strong>
                  <span className="stockQtyInline">
                    ({product.stock_type === 'infinite' ? '∞' : (product.stock_count ?? 0)})
                  </span>
                </div>

                <div className="infoProd">
                  <div className="slug">• {product.slug ?? "sem slug"}</div>
                  <div className="tipo">• {
                    product.stock_type === 'key' ? 'Keys' :
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
                    <div className="variationsList">
                      {product.variations.map((v) => (
                        <div className="variationItem" key={v.id}>
                          {v.name} ({v.is_unlimited ? '∞' : v.stock_count})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="cardActions">
                  <button
                    className="btnEditSmall"
                    onClick={() => handleManageStock(product.slug)}
                    disabled={!product.slug}
                  >
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
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="btnPagination"
            >
              &rarr;
            </button>
          </div>
        )}

        {filteredProducts.length === 0 && (
          <p className="emptyMsg">Nenhum produto encontrado.</p>
        )}
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
        {BACKGROUND_OPTIONS.map((option) => (
          <label className="radioRow" key={option.value}>
            <input
              type="radio"
              checked={(storeSettings.backgroundType ?? "lines") === option.value}
              onChange={() => onBackgroundTypeChange(option.value)}
            />
            {option.label}
          </label>
        ))}
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