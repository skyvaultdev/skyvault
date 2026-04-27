"use client";

import "./dashboard.css";
import "./modal.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar, { type DashboardTab } from "./components/Sidebar";
import DashboardTabs from "./components/DashboardTabs";
import ProductPreview from "./components/ProductPreview";

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
  stock_type?: 'key' | 'file' | 'infinite';
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

const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  owner: [
    "Acesso total",
    "Gerenciar equipe",
    "Editar loja",
    "Remover admins",
  ],
  admin: [
    "Gerenciar produtos",
    "Ver analytics",
    "Editar loja",
  ],
  editor: [
    "Editar produtos",
    "Organizar catálogo",
  ],
};

type AdminRole = "owner" | "admin" | "editor";

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
    setAddEmail("")
    setAddRole("editor")
    setAddError(null)
    setAddBusy(false)
    setIsAddOpen(true)
  }

  function closeAdd() {
    setIsAddOpen(false)
  }

  function openRemove() {
    const first = admins[0]?.id ?? null;
    setRemoveId(first)
    setRemoveError(null)
    setRemoveBusy(false)
    setIsRemoveOpen(true)
  }

  function closeRemove() {
    setIsRemoveOpen(false)
  }

  function validateEmail(email: string) {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return "Digite um email.";
    if (!trimmedEmail.includes("@") || !trimmedEmail.includes(".")) return "Digite um email válido.";
    return null;
  }

  async function handleAddConfirm() {
    const error = validateEmail(addEmail);
    if (error) return setAddError(error);

    setAddBusy(true);
    setAddError(null);

    try {
      const res = await fetch("/api/admins/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: addEmail,
          role: addRole,
        }),
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
      const res = await fetch(`/api/admins/remove/${removeId}`, {
        method: "DELETE",
      });

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
          onBackgroundTypeChange={(type) => setStoreSettings(p => ({ ...p, backgroundType: type }))}
          onBackgroundCssChange={(css) => setStoreSettings(p => ({ ...p, backgroundCss: css }))}
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
          <h3>Prévia da Home</h3>
          <div className="previewBanner">Banner principal da loja</div>
          <div className="previewGrid">
            {previewProducts.map((product) => (
              <article key={product.id} className="previewCard">
                <strong>{product.name}</strong>
                <span>ID: {product.id}</span>
              </article>
            ))}
            {previewProducts.length === 0 && <p>Nenhum produto disponível para prévia.</p>}
          </div>
        </section>
      );
    }

    if (selectedTab === "cores") {
      return (
        <section className="settingsPanel">
          <h3>Cores da loja</h3>

          <label className="fieldLabel" htmlFor="color-target">
            Grupo de cor
          </label>
          <select
            id="color-target"
            value={colorTarget ?? "primary"}
            onChange={(event) => setColorTarget(event.target.value as "primary" | "secondary")}
            className="settingsInput"
          >
            <option value="primary">Primária</option>
            <option value="secondary">Secundária</option>
          </select>

          <label className="fieldLabel" htmlFor="color-picker">
            Selecionar cor
          </label>
          <input
            id="color-picker"
            type="color"
            value={String(selectedColor || "#b700ff")}
            onChange={(event) => setSelectedColor(event.target.value)}
            className="colorPicker"
            aria-label="Selecionar cor da loja"
          />

          <button className="btn" type="button" onClick={() => void saveColors()} aria-label="Salvar cores da loja">
            Salvar cores
          </button>

          <p className="helperText">
            Primária: {storeSettings.primaryColor ?? "#b700ff"} | Secundária:{" "}
            {storeSettings.secondaryColor ?? "#6400ff"}
          </p>
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
              onChange={() => setStoreSettings((prev) => ({ ...prev, backgroundType: "lines" }))}
            />
            Linhas
          </label>

          <label className="radioRow">
            <input
              type="radio"
              checked={(storeSettings.backgroundType ?? "lines") === "dots"}
              onChange={() => setStoreSettings((prev) => ({ ...prev, backgroundType: "dots" }))}
            />
            Pontos
          </label>

          <label className="fieldLabel" htmlFor="background-image">
            Upload de imagem
          </label>
          <input
            id="background-image"
            type="file"
            accept="image/*"
            onChange={(event) => setBackgroundImageFile(event.target.files?.[0] ?? null)}
            className="settingsInput"
          />

          <label className="fieldLabel" htmlFor="background-css">
            CSS customizado
          </label>
          <textarea
            id="background-css"
            value={storeSettings.backgroundCss ?? ""}
            onChange={(event) => setStoreSettings((prev) => ({ ...prev, backgroundCss: event.target.value }))}
            className="settingsTextarea"
            rows={4}
          />

          <button className="btn" type="button" onClick={() => void saveBackground()} aria-label="Salvar background da loja">
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
                onDragStart={() => setDraggedProductId(product.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveDraggedProduct(product.id)}
                className="sortableItem"
              >
                {product.name}
              </div>
            ))}
          </div>
          <button className="btn" type="button" onClick={() => void savePositions()} aria-label="Salvar ordem dos produtos">
            Salvar ordem
          </button>
        </section>
      );
    }


    return (
      <section className="settingsPanel">
        <h3>Equipe</h3>

        <div>
          <button type="button" className="addbtn" onClick={openAdd}>
            Adicionar Equipe
          </button>

          <button type="button" className="removebtn" onClick={openRemove} disabled={admins.length === 0}>
            Remover Equipe
          </button>
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

        {admins.length === 0 && <p>Nenhum admin encontrado.</p>}

        {isAddOpen && (
          <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Adicionar equipe">
            <div className="modalContent">
              <h4>Adicionar equipe</h4>

              <label className="fieldLabel">
                Email
              </label>
              <input
                id="add-email"
                type="text"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                className="settingsInput"
                placeholder="email@dominio.com"
                autoFocus
              />

              <label className="fieldLabel" htmlFor="add-role">
                Role
              </label>
              <select
                id="add-role"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as AdminRole)}
                className="settingsInput"
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
              </select>

              <div className="rolePreview">
                <strong>Permissões atribuídas:</strong>

                <ul>
                  {ROLE_PERMISSIONS[addRole].map((perm) => (
                    <li key={perm}>{perm}</li>
                  ))}
                </ul>
              </div>

              {addError && <p className="helperText">{addError}</p>}

              <div>
                <button type="button" className="btnSecondary" onClick={closeAdd} disabled={addBusy}>
                  Cancelar
                </button>
                <button type="button" className="btn" onClick={() => void handleAddConfirm()} disabled={addBusy}>
                  {addBusy ? "Salvando..." : "Adicionar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {isRemoveOpen && (
          <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Remover equipe">
            <div className="modalContent">
              <h4>Remover da equipe</h4>

              <label className="fieldLabel" htmlFor="remove-select">
                Selecionar usuário
              </label>

              <select
                id="remove-select"
                value={removeId !== null ? String(removeId) : ""}
                onChange={(e) => setRemoveId(Number(e.target.value))}
                className="settingsInput"
              >
                {admins.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.email} {a.role ? `(${a.role})` : ""}
                  </option>
                ))}
              </select>

              {removeError && <p className="helperText">{removeError}</p>}

              <div>
                <button type="button" className="btnSecondary" onClick={closeRemove} disabled={removeBusy}>
                  Cancelar
                </button>
                <button type="button" className="removebtn" onClick={() => void handleRemoveConfirm()} disabled={removeBusy}>
                  {removeBusy ? "Removendo..." : "Remover"}
                </button>
              </div>
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
          <div className="statCard"><div className="statValue">{stats.acessos.toLocaleString("pt-BR")}</div><div className="statLabel">ACESSOS<br />REGISTRADOS</div></div>
          <div className="statCard"><div className="statValue">{stats.vendidos.toLocaleString("pt-BR")}</div><div className="statLabel">PRODUTOS<br />VENDIDOS</div></div>
          <div className="statCard"><div className="statValue">R$ {stats.arrecadados.toLocaleString("pt-BR")}</div><div className="statLabel">ARRECADADOS</div></div>
        </div>
      </header>

      <main className="content">
        <section className="mainArea">
          <div className="dashboardBuilder">
            <Sidebar selectedTab={selectedTab} onSelect={setSelectedTab} />
            <div className="tabContentContainer">
              {renderTabContent()}
            </div>
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
                <a
                  onClick={() => {
                    if (type === "products" && item.slug) {
                      setPreviewSlug(item.slug);
                      setSelectedTab("inicio");
                    }
                  }}

                >
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