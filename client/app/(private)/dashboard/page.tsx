"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar, { type DashboardTab } from "./components/Sidebar";
import DashboardTabs from "./components/DashboardTabs";
import ProductPreview from "./components/ProductPreview";
import HomePreview from "./components/HomePreview";
import "@/app/home.css";
import "./dashboard.css";
import "./modal.css";
import "./components/homeprev.css";

type TypeKey = "products" | "categories" | "coupon";

type Item = {
  id: number;
  name: string;
  slug?: string;
  variations: [];
  position?: number | null;
};

type ProductItem = {
  id: number;
  name: string;
  slug?: string;
  position?: number | null;
  variations: [];
  stock_type?: "key" | "file" | "infinite";
  stock_count?: number;
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
  role?: string;
};

type AdminRole = "owner" | "admin" | "editor";

const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  owner: ["Acesso total", "Gerenciar equipe", "Editar loja", "Remover admins"],
  admin: ["Gerenciar produtos", "Ver analytics", "Editar loja"],
  editor: ["Editar produtos", "Organizar catálogo"],
};

export default function Dashboard() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeKey>("products");
  const [selectedTab, setSelectedTab] = useState<DashboardTab>("inicio");

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState("");

  const [stats, setStats] = useState<Stats>({
    acessos: 0,
    vendidos: 0,
    arrecadados: 0,
  });

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
    backgroundCss: ""
  });

  const [homeData, setHomeData] = useState({
    banners: [],
    categories: [],
    sections: [],
    highlights: [],
  });

  const [loadingHomeData, setLoadingHomeData] = useState(false);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [colorTarget, setColorTarget] = useState<"primary" | "secondary">("primary");
  const [selectedColor, setSelectedColor] = useState("#b700ff");
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);

  const [admins, setAdmins] = useState<Admin[]>([]);

  const [orderedProducts, setOrderedProducts] = useState<Item[]>([]);
  const [draggedProductId, setDraggedProductId] = useState<number | null>(null);

  const [addEmail, setAddEmail] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addRole, setAddRole] = useState<AdminRole>("editor");
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  function openAdd() {
    setAddEmail("");
    setAddRole("editor");
    setAddError(null);
    setAddBusy(false);
    setIsAddOpen(true);
  }

  function closeAdd() {
    setIsAddOpen(false);
  }

  function openRemove() {
    const first = admins[0]?.id ?? null;
    setRemoveId(first);
    setRemoveError(null);
    setRemoveBusy(false);
    setIsRemoveOpen(true);
  }

  function closeRemove() {
    setIsRemoveOpen(false);
  }

  function validateEmail(email: string) {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) return "Digite um email.";
    if (!trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
      return "Digite um email válido.";
    }

    return null;
  }

  const loadHomeData = useCallback(async () => {
    try {
      setLoadingHomeData(true);
      const res = await fetch("/api/home-data");
      if (!res.ok) return;
      const json = await res.json();
      setHomeData({
        banners: json.data?.banners || [],
        categories: json.data?.categories || [],
        sections: json.data?.sections || [],
        highlights: json.data?.highlights || [],
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingHomeData(false);
    }
  }, []);

  async function handleAddConfirm() {
    const error = validateEmail(addEmail);
    if (error) {
      setAddError(error);
      return;
    }

    setAddBusy(true);
    setAddError(null);

    try {
      const res = await fetch("/api/admins/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail, role: addRole }),
      });

      const json = await res.json();

      if (!res.ok) {
        setAddError(json.error || "Erro ao adicionar.");
        return;
      }

      await loadAdmins();
      closeAdd();
    } finally {
      setAddBusy(false);
    }
  }

  async function handleRemoveConfirm() {
    if (!removeId) return;

    setRemoveBusy(true);
    setRemoveError(null);

    try {
      const res = await fetch(`/api/admins/remove/${removeId}`, { method: "DELETE" });
      const json = await res.json();

      if (!res.ok) {
        setRemoveError(json.error || "Erro ao remover");
        return;
      }

      await loadAdmins();
      closeRemove();
    } finally {
      setRemoveBusy(false);
    }
  }

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

      const data = await res.json();
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

      const json = await res.json();
      const loadedItems = Array.isArray(json.data) ? json.data : [];
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

    const json = await response.json();
    const data = json.data ?? {};

    const nextSettings: StoreSettings = {
      primaryColor: String(data.primary_color ?? "#b700ff"),
      secondaryColor: String(data.secondary_color ?? "#6400ff"),
      backgroundType: String(data.background_style ?? "lines") === "dots" ? "dots" : "lines",
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
    const data = await response.json();
    setAdmins(data.data ?? []);
  }

  useEffect(() => {
    void loadItems();
    void loadStats();
    void loadStoreSettings();
    void loadAdmins();
    void loadHomeData();
  }, [loadItems, loadStoreSettings, loadHomeData]);

  useEffect(() => {
    const delay = setTimeout(() => void loadItems(search), 400);
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

    const response = await fetch("/api/store-settings", { method: "POST", body: formData });
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
    const payload = orderedProducts.map((product, index) => ({
      id: product.id,
      position: index + 1,
    }));

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

  const previewProducts = useMemo(
    () => (orderedProducts.length > 0 ? orderedProducts : items),
    [items, orderedProducts]
  );

  const renderTabContent = () => {
    if (selectedTab === "inicio" && previewSlug) {
      return <ProductPreview slug={previewSlug} onBack={() => setPreviewSlug(null)} />;
    }

    if (selectedTab === "estoque") {
      return (
        <DashboardTabs
          selectedTab="estoque"
          orderedProducts={orderedProducts}
          previewProducts={previewProducts}
          colorTarget={colorTarget}
          selectedColor={selectedColor}
          onChangeColorTarget={setColorTarget}
          onChangeSelectedColor={setSelectedColor}
          onSaveColors={saveColors}
          storeSettings={storeSettings}
          onBackgroundTypeChange={(type) => setStoreSettings((p) => ({ ...p, backgroundType: type }))}
          onBackgroundCssChange={(css) => setStoreSettings((p) => ({ ...p, backgroundCss: css }))}
          onBackgroundImageChange={setBackgroundImageFile}
          onSaveBackground={saveBackground}
          onDragStart={setDraggedProductId}
          onDrop={moveDraggedProduct}
          onSavePositions={savePositions}
          admins={admins}
        />
      );
    }

    if (selectedTab === "inicio") {
      return (
        <section className="settingsPanel">
          <div className="previewHeader">
            <h3>Prévia da Home</h3>
            <button className="btnhome" onClick={() => void loadHomeData()}>Atualizar Preview</button>
          </div>

          {loadingHomeData ? (
            <div className="previewPlaceholder">Carregando visualização...</div>
          ) : (
            <div className="homePreviewWrapper">
              <div className="browserToolbar"></div>
              <div className="previewScrollContainer">
                <div className="previewRealSize">
                  <HomePreview
                    banners={homeData.banners}
                    categories={homeData.categories}
                    highlights={homeData.highlights}
                    sections={homeData.sections}
                    isPreview={true}
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      );
    }

    if (selectedTab === "cores") {
      return (
        <section className="settingsPanel">
          <h3>Cores da loja</h3>
          <label className="fieldLabel">Grupo de cor</label>
          <select
            value={colorTarget}
            onChange={(e) => setColorTarget(e.target.value as "primary" | "secondary")}
            className="settingsInput"
          >
            <option value="primary">Primária</option>
            <option value="secondary">Secundária</option>
          </select>
          <input type="color" value={selectedColor} onChange={(e) => setSelectedColor(e.target.value)} className="colorPicker" />
          <button className="btn" onClick={() => void saveColors()}>Salvar cores</button>
        </section>
      );
    }

    if (selectedTab === "background") {
      return (
        <section className="settingsPanel">
          <h3>Background</h3>
          <label className="radioRow">
            <input type="radio" checked={storeSettings.backgroundType === "lines"} onChange={() => setStoreSettings((p) => ({ ...p, backgroundType: "lines" }))} />
            Linhas
          </label>
          <label className="radioRow">
            <input type="radio" checked={storeSettings.backgroundType === "dots"} onChange={() => setStoreSettings((p) => ({ ...p, backgroundType: "dots" }))} />
            Pontos
          </label>
          <input type="file" accept="image/*" onChange={(e) => setBackgroundImageFile(e.target.files?.[0] ?? null)} className="settingsInput" />
          <textarea value={storeSettings.backgroundCss} onChange={(e) => setStoreSettings((p) => ({ ...p, backgroundCss: e.target.value }))} className="settingsTextarea" rows={4} />
          <button className="btn" onClick={() => void saveBackground()}>Salvar background</button>
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
                onDragStart={() => setDraggedProductId(product.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => moveDraggedProduct(product.id)}
                className="sortableItem"
              >
                {product.name}
              </div>
            ))}
          </div>
          <button className="btn" onClick={() => void savePositions()}>Salvar ordem</button>
        </section>
      );
    }

    return (
      <section className="settingsPanel">
        <h3>Equipe</h3>

        <div>
          <button type="button" className="addbtn" onClick={openAdd}>Adicionar Equipe</button>
          <button type="button" className="removebtn" onClick={openRemove} disabled={admins.length === 0}>Remover Equipe</button>
        </div>

        <table className="teamTable">
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.id}>
                <td>{admin.id}</td>
                <td>{admin.email}</td>
                <td>{admin.role ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {isAddOpen && (
          <div className="modalOverlay">
            <div className="modalContent">
              <h4>Adicionar equipe</h4>
              <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} className="settingsInput" />
              <select value={addRole} onChange={(e) => setAddRole(e.target.value as AdminRole)} className="settingsInput">
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
              </select>
              <ul>
                {ROLE_PERMISSIONS[addRole].map((perm) => (
                  <li key={perm}>{perm}</li>
                ))}
              </ul>
              {addError && <p>{addError}</p>}
              <button className="btnSecondary" onClick={closeAdd}>Cancelar</button>
              <button className="btn" onClick={() => void handleAddConfirm()}>{addBusy ? "Salvando..." : "Adicionar"}</button>
            </div>
          </div>
        )}

        {isRemoveOpen && (
          <div className="modalOverlay">
            <div className="modalContent">
              <h4>Remover equipe</h4>
              <select value={removeId ?? ""} onChange={(e) => setRemoveId(Number(e.target.value))} className="settingsInput">
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>{a.email}</option>
                ))}
              </select>
              {removeError && <p>{removeError}</p>}
              <button className="btnSecondary" onClick={closeRemove}>Cancelar</button>
              <button className="removebtn" onClick={() => void handleRemoveConfirm()}>{removeBusy ? "Removendo..." : "Remover"}</button>
            </div>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="app">
      <header className="topbar">
        {loadingStats && <div>Carregando estatísticas...</div>}
        {statsError && <div>{statsError}</div>}
        <div className="stats">
          <div className="statCard">
            <div className="statValue">{stats.acessos.toLocaleString("pt-BR")}</div>
            <div className="statLabel">ACESSOS<br />REGISTRADOS</div>
          </div>
          <div className="statCard">
            <div className="statValue">{stats.vendidos.toLocaleString("pt-BR")}</div>
            <div className="statLabel">PRODUTOS<br />VENDIDOS</div>
          </div>
          <div className="statCard">
            <div className="statValue">R$ {stats.arrecadados.toLocaleString("pt-BR")}</div>
            <div className="statLabel">ARRECADADOS</div>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="mainArea">
          <div className="dashboardBuilder">
            <Sidebar selectedTab={selectedTab} onSelect={setSelectedTab} />
            <div className="tabContentContainer">{renderTabContent()}</div>
          </div>
        </section>

        <aside className="sidebar">
          <div className="searchRow">
            <button className="iconBtn iconAdd" onClick={() => router.push(`/dashboard/${type}/add`)}>+</button>
            <input className="searchInput" placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="searchSelect" value={type} onChange={(e) => setType(e.target.value as TypeKey)}>
              <option value="products">Produtos</option>
              <option value="categories">Categorias</option>
              <option value="coupon">Cupons</option>
            </select>
          </div>

          <div className="productList">
            {loadingItems && <div>Carregando...</div>}
            {!loadingItems && items.map((item) => (
              <div className="productItem" key={item.id}>
                <a onClick={() => {
                  if (type === "products" && item.slug) {
                    setPreviewSlug(item.slug);
                    setSelectedTab("inicio");
                  }
                }}>
                  {item.name}
                </a>
                <div className="productActions">
                  <button className="iconBtn iconEdit" onClick={() => handleEdit(item.slug ?? item.id)}>✎</button>
                  <button className="iconBtn iconRemove" onClick={() => openDeleteModal(item.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </main>

      {isDeleteOpen && (
        <div className="modalOverlay" onClick={closeDeleteModal}>
          <div className="modalBox" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmar exclusão</h3>
            <p>Tem certeza que deseja deletar este {deleteLabel}?</p>
            <div className="modalActions">
              <button className="btnCancel" onClick={closeDeleteModal}>Cancelar</button>
              <button className="btnConfirm" onClick={() => void confirmDelete()}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}