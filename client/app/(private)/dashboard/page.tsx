"use client";

import "./dashboard.css";
import "./modal.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar, { type DashboardTab } from "./components/Sidebar";
import DashboardTabs from "./components/DashboardTabs";

type TypeKey = "products" | "categories" | "coupon";

type Item = {
  id: number;
  name: string;
  slug?: string;
  position?: number | null;
};

type Stats = {
  acessos: number;
  vendidos: number;
  arrecadados: number;
};

type StoreSettings = {
  primaryColor: string;
  secondaryColor: string;
  backgroundType: "lines" | "dots";
  backgroundImageUrl: string;
  backgroundCss: string;
};

type Admin = {
  id: number;
  email: string;
};

export default function Dashboard() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeKey>("products");
  const [selectedTab, setSelectedTab] = useState<DashboardTab>("inicio");

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState("");

  const [stats, setStats] = useState<Stats>({ acessos: 0, vendidos: 0, arrecadados: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState("");

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    primaryColor: "#b700ff",
    secondaryColor: "#6400ff",
    backgroundType: "lines",
    backgroundImageUrl: "",
    backgroundCss: "",
  });
  const [colorTarget, setColorTarget] = useState<"primary" | "secondary">("primary");
  const [selectedColor, setSelectedColor] = useState("#b700ff");
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);

  const [admins, setAdmins] = useState<Admin[]>([]);
  const [orderedProducts, setOrderedProducts] = useState<Item[]>([]);
  const [draggedProductId, setDraggedProductId] = useState<number | null>(null);

  async function loadStats() {
    try {
      setLoadingStats(true);
      setStatsError("");
      const res = await fetch("/api/stats", { method: "GET" });
      if (!res.ok) {
        setStatsError("Falha ao carregar estatísticas.");
        setStats({ acessos: 0, vendidos: 0, arrecadados: 0 });
        return;
      }

      const data = (await res.json()) as { ok?: boolean; data?: Partial<Stats> };
      const payload = data.data ?? {};
      setStats({
        acessos: Number(payload.acessos) || 0,
        vendidos: Number(payload.vendidos) || 0,
        arrecadados: Number(payload.arrecadados) || 0,
      });
    } catch {
      setStatsError("Erro de rede ao carregar estatísticas.");
    } finally {
      setLoadingStats(false);
    }
  }

  const loadItems = useCallback(async (query?: string) => {
    try {
      setLoadingItems(true);
      setItemsError("");
      const url = query?.trim()
        ? `/api/${type}?name=${encodeURIComponent(query.trim())}`
        : `/api/${type}`;

      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        setItemsError("Falha ao carregar dados.");
        setItems([]);
        return;
      }

      const json = (await res.json()) as { ok?: boolean; data?: Item[] };
      const data = json.data as Item[];
      const loadedItems = Array.isArray(data) ? data : [];
      setItems(loadedItems);
      if (type === "products" && !query?.trim()) {
        setOrderedProducts(loadedItems);
      }
    } catch {
      setItemsError("Erro de rede.");
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [type]);

  const loadStoreSettings = useCallback(async () => {
    const response = await fetch("/api/store-settings", { cache: "no-store" });
    if (!response.ok) return;

    const json = (await response.json()) as { ok?: boolean; data?: Record<string, unknown> };
    const data = json.data ?? {};
    const nextSettings: StoreSettings = {
      primaryColor: String(data.primary_color ?? "#b700ff"),
      secondaryColor: String(data.secondary_color ?? "#6400ff"),
      backgroundType: (String(data.background_style ?? "lines") === "dots" ? "dots" : "lines"),
      backgroundImageUrl: String(data.background_img_url ?? ""),
      backgroundCss: String(data.background_css ?? ""),
    };

    setStoreSettings(nextSettings);
    setSelectedColor(colorTarget === "primary" ? nextSettings.primaryColor : nextSettings.secondaryColor);
    document.documentElement.style.setProperty("--primary", nextSettings.primaryColor);
    document.documentElement.style.setProperty("--secondary", nextSettings.secondaryColor);
  }, [colorTarget]);

  async function loadAdmins() {
    const response = await fetch("/api/admins", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { ok?: boolean; data?: Admin[] };
    setAdmins(data.data ?? []);
  }

  useEffect(() => {
    void loadItems();
    void loadStats();
    void loadStoreSettings();
    void loadAdmins();
  }, [loadItems, loadStoreSettings]);

  useEffect(() => {
    const delay = setTimeout(() => {
      void loadItems(search);
    }, 400);

    return () => clearTimeout(delay);
  }, [search, type, loadItems]);

  useEffect(() => {
    setSelectedColor(colorTarget === "primary" ? storeSettings.primaryColor : storeSettings.secondaryColor);
  }, [colorTarget, storeSettings.primaryColor, storeSettings.secondaryColor]);

  function handleEdit(slugOrId: string | number | undefined) {
    if (!slugOrId) return;
    router.push(`/dashboard/${type}/edit/${slugOrId}`);
  }

  function openDeleteModal(id: number) {
    setItemToDelete(id);
    setIsDeleteOpen(true);
  }

  function closeDeleteModal() {
    if (isDeleting) return;
    setIsDeleteOpen(false);
    setItemToDelete(null);
  }

  async function confirmDelete() {
    if (!itemToDelete) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/${type}/remove/${itemToDelete}`, { method: "DELETE" });
      if (res.ok) {
        closeDeleteModal();
        void loadItems(search);
      } else {
        alert("Erro ao deletar.");
      }
    } catch {
      alert("Erro de rede.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function saveColors() {
    const payload = {
      primaryColor: colorTarget === "primary" ? selectedColor : storeSettings.primaryColor,
      secondaryColor: colorTarget === "secondary" ? selectedColor : storeSettings.secondaryColor,
      backgroundStyle: storeSettings.backgroundType,
    };

    const response = await fetch("/api/store-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      await loadStoreSettings();
    }
  }

  async function saveBackground() {
    const formData = new FormData();
    formData.append("backgroundStyle", storeSettings.backgroundType);
    formData.append("backgroundCss", storeSettings.backgroundCss);
    if (backgroundImageFile) {
      formData.append("backgroundImage", backgroundImageFile);
    }

    const response = await fetch("/api/store-settings", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      await loadStoreSettings();
      setBackgroundImageFile(null);
    }
  }

  function moveDraggedProduct(targetId: number) {
    if (draggedProductId === null || draggedProductId === targetId) return;

    const current = [...orderedProducts];
    const draggedIndex = current.findIndex((product) => product.id === draggedProductId);
    const targetIndex = current.findIndex((product) => product.id === targetId);
    if (draggedIndex < 0 || targetIndex < 0) return;

    const [draggedItem] = current.splice(draggedIndex, 1);
    current.splice(targetIndex, 0, draggedItem);
    setOrderedProducts(current);
  }

  async function savePositions() {
    const payload = orderedProducts.map((product, index) => ({ id: product.id, position: index + 1 }));
    const response = await fetch("/api/products/order", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      await loadItems();
    }
  }

  const deleteLabel = type === "products" ? "produto" : type === "categories" ? "categoria" : "cupom";
  const previewProducts = useMemo(() => orderedProducts.length > 0 ? orderedProducts : items, [items, orderedProducts]);

  return (
    <div className="app">
      <header className="topbar">
        {loadingStats && <div>Carregando estatísticas...</div>}
        {statsError && <div>{statsError}</div>}
        <div className="stats">
          <div className="statCard"><div className="statValue">{stats.acessos.toLocaleString("pt-BR")}</div><div className="statLabel">ACESSOS<br />REGISTRADOS</div></div>
          <div className="statCard"><div className="statValue">{stats.vendidos.toLocaleString("pt-BR")}</div><div className="statLabel">PRODUTOS<br />VENDIDOS</div></div>
          <div className="statCard"><div className="statValue">R$ {stats.arrecadados.toLocaleString("pt-BR")}</div><div className="statLabel">ARRECADADOS</div></div>
        </div>
      </header>

      <main className="content">
        <section className="mainArea">
          <div className="dashboardBuilder">
            <Sidebar selectedTab={selectedTab} onSelect={setSelectedTab} />
            <DashboardTabs
              selectedTab={selectedTab}
              previewProducts={previewProducts}
              colorTarget={colorTarget}
              selectedColor={selectedColor}
              onChangeColorTarget={setColorTarget}
              onChangeSelectedColor={setSelectedColor}
              onSaveColors={saveColors}
              storeSettings={storeSettings}
              onBackgroundTypeChange={(backgroundType) => setStoreSettings((prev) => ({ ...prev, backgroundType }))}
              onBackgroundCssChange={(backgroundCss) => setStoreSettings((prev) => ({ ...prev, backgroundCss }))}
              onBackgroundImageChange={setBackgroundImageFile}
              onSaveBackground={saveBackground}
              orderedProducts={orderedProducts}
              onDragStart={setDraggedProductId}
              onDrop={moveDraggedProduct}
              onSavePositions={savePositions}
              admins={admins}
            />
          </div>
        </section>

        <aside className="sidebar">
          <div className="searchRow">
            <button
              className="iconBtn iconAdd"
              type="button"
              aria-label="Adicionar produto"
              onClick={() => router.push("/dashboard/products/add")}
            >
              +
            </button>

            <input
              className="searchInput"
              type="text"
              placeholder="Pesquisar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select className="searchSelect" value={type} onChange={(e) => setType(e.target.value as TypeKey)}>
              <option value="products">Produtos</option>
              <option value="categories">Categorias</option>
              <option value="coupon">Cupons</option>
            </select>
          </div>

          <div className="productList">
            {loadingItems && <div>Carregando...</div>}
            {itemsError && <div>{itemsError}</div>}
            {!loadingItems && items.length === 0 && <div>Nenhum resultado encontrado</div>}

            {!loadingItems &&
              items.map((item) => (
                <div className="productItem" key={item.id}>
                  <a className="productName">{item.name}</a>
                  <div className="productActions">
                    <button className="iconBtn iconEdit" type="button" onClick={() => handleEdit(item.slug ?? item.id)} aria-label={`Editar ${item.name}`}>✎</button>
                    <button className="iconBtn iconRemove" type="button" onClick={() => openDeleteModal(item.id)} aria-label={`Remover ${item.name}`}>✕</button>
                  </div>
                </div>
              ))}
          </div>
        </aside>
      </main>

      {isDeleteOpen && (
        <div className="modalOverlay" onClick={closeDeleteModal}>
          <div className="modalBox" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3>Confirmar exclusão</h3>
            <p>Tem certeza que deseja deletar este {deleteLabel}?</p>
            <div className="modalActions">
              <button className="btnCancel" type="button" onClick={closeDeleteModal} disabled={isDeleting}>Cancelar</button>
              <button className="btnConfirm" type="button" onClick={() => void confirmDelete()} disabled={isDeleting}>{isDeleting ? "Deletando..." : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
