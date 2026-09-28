"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";

import Sidebar, { type DashboardTab, type Permission } from "./components/Sidebar";
import DashboardTabs from "./components/DashboardTabs";
import ProductPreview from "./components/ProductPreview";
import PermissionGuard from "./components/PermissionGuard";
import HomePreview from "./components/HomePreview";
import StaffChatPanel from "./components/StaffChatPanel";
import OrdersPanel from "./components/OrdersPanel";
import ShippingCarriersPanel from "./components/ShippingCarriersPanel";
import PaymentsSettingsPanel from "./components/PaymentsSettingsPanel";
import GeneralSettingsPanel from "./components/GeneralSettingsPanel";
import StockMovementsPanel from "./components/StockMovementsPanel";
import StatsPanel from "./components/StatsPanel";
import ResellersPanel from "./components/ResellersPanel";
import QuestionsPanel from "./components/QuestionsPanel";
import ReviewsPanel from "./components/ReviewsPanel";
import TeamPanel from "./components/TeamPanel";
import TemplatesPanel from "./components/TemplatesPanel";
import "./components/categoryprev.css"
import Icon from "@/components/icons/Icon";
import CategoryPreview from "./components/CategoryPreview";
import "@/app/home.css";
import "./dashboard.css";
import "./modal.css";
import "./components/homeprev.css";
import { Role, ROLES } from "@/lib/jwt/permissions";
import { resolvePattern } from "@/lib/pattern/patterns";
import { useModal } from "@/app/(components)/modal/ModalProvider";

type TypeKey = "products" | "categories" | "coupon";


type Item = {
  id: number;
  name: string;
  slug?: string;
  code?: string;
  variations: [];
  position?: number | null;
};

type Stats = {
  acessos: number;
  vendidos: number;
  arrecadados: number;
};

type BackgroundType =
  | "lines"
  | "dots"
  | "grid"
  | "diagonal"
  | "cyber"
  | "heroicons"
  | "skulls"
  | "none";

type StoreSettings = {
  primaryColor: string;
  secondaryColor: string;
  backgroundType: BackgroundType;
  backgroundImageUrl: string;
  backgroundCss: string;
  backgroundSolidColor: string;
  logoUrl: string;
  storeName: string;
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

const TAB_PERMISSIONS: Record<DashboardTab, Permission> = {
  inicio: "dashboard.access",
  infos: "dashboard.access",
  cores: "store.customize",
  background: "store.customize",
  posicao: "products.write",
  estoque: "products.write",
  registrosEstoque: "products.write",
  perguntas: "products.write",
  avaliacoes: "products.write",
  chat: "chat.access",
  equipe: "team.manage",
  pedidos: "orders.read",
  transportadoras: "shipping.manage",
  pagamentos: "payments.manage",
  revendedores: "resellers.manage",
  templates: "store.customize",
  geral: "store.customize",
};

const BG_PALETTE = ["#050505", "#0d0d12", "#111827", "#0f172a", "#1e1b4b", "#2e1065", "#3b0764", "#4a044e", "#450a0a", "#431407", "#052e16", "#022c22", "#083344", "#172554", "#1c1917", "#27272a", "#ffffff", "#f4f4f5"];

const roleHierarchy: Record<Role, number> = {
  owner: 3,
  admin: 2,
  editor: 1,
};

export default function Dashboard() {
  const router = useRouter();
  const modal = useModal();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [itemType, setItemType] = useState<TypeKey>("products");
  const [selectedTab, setSelectedTab] = useState<DashboardTab>("inicio");
  const [showStatsCharts, setShowStatsCharts] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState("");

  const [orderedProducts, setOrderedProducts] = useState<Item[]>([]);

  const previewProducts = useMemo(
    () => (orderedProducts.length > 0 ? orderedProducts : items),
    [items, orderedProducts]
  );

  const filteredProducts = useMemo(() => {
    const source = itemType === "products" ? previewProducts : items;
    return source.filter((product) =>
      product.name?.toLowerCase().includes(search.toLowerCase()) ||
      product.slug?.toLowerCase().includes(search.toLowerCase()) ||
      product.code?.toLowerCase().includes(search.toLowerCase())
    );
  }, [items, previewProducts, itemType, search]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage]);

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  // Reset to page 1 whenever the search term or item type changes, so the
  // user never lands on a page that no longer exists after filtering.
  useEffect(() => {
    setCurrentPage(1);
  }, [search, itemType]);

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
    backgroundType: "none",
    backgroundImageUrl: "",
    backgroundCss: "",
    backgroundSolidColor: "#050505",
    logoUrl: "",
    storeName: "",
  });

  const [homeData, setHomeData] = useState({
    banners: [],
    categories: [],
    sections: [],
    highlights: [],
  });

  const [categoryData, setCategoryData] = useState({
    categories: [],
    sections: [],
  });

  const [loadingHomeData, setLoadingHomeData] = useState(false);
  const [loadingCategoryData, setLoadingCategoryData] = useState(false);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [colorTarget, setColorTarget] = useState<"primary" | "secondary">("primary");
  const [selectedColor, setSelectedColor] = useState("#b700ff");
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);
  const [backgroundImagePreview, setBackgroundImagePreview] = useState<string | null>(null);
  const backgrounds: BackgroundType[] = ["lines", "dots", "grid", "diagonal", "cyber", "heroicons", "skulls", "none"];
  const backgroundLabels: Record<BackgroundType, string> = {
    lines: "Linhas",
    dots: "Pontos",
    grid: "Grade",
    diagonal: "Diagonal",
    cyber: "Cyber",
    heroicons: "Heroicons",
    skulls: "Caveiras",
    none: "Nenhum"
  };

  const [admins, setAdmins] = useState<Admin[]>([]);

  const [draggedProductId, setDraggedProductId] = useState<number | null>(null);

  const [addEmail, setAddEmail] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addRole, setAddRole] = useState<AdminRole>("editor");
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const [currentUserRole, setCurrentUserRole] = useState<AdminRole | null>(null);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<AdminRole>("editor");
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const [isSalvarOpen, setIsSalvarOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("Cores salvas com sucesso!");
  const [shouldReloadOnClose, setShouldReloadOnClose] = useState(false);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [storeName, setStoreName] = useState("");

  function openSalvarModal(message: string, reload: boolean = false) {
    setModalMessage(message);
    setShouldReloadOnClose(reload);
    setIsSalvarOpen(true);
  }

  function closeSalvarModal() {
    setIsSalvarOpen(false);
    if (shouldReloadOnClose) {
      window.location.reload();
    }
  }

  function openAdd() {
    setAddEmail("");
    setAddRole("editor");
    setAddError(null);
    setAddBusy(false);
    setIsAddOpen(true);
  }

  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [questionsUnreadCount, setQuestionsUnreadCount] = useState(0);

  useEffect(() => {
    async function loadChatUnread() {
      try {
        const res = await fetch("/api/chat/unread-count", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        setChatUnreadCount(Number(json.count) || 0);
      } catch {
        // ignora erro pontual
      }
    }
    async function loadQuestionsUnread() {
      try {
        const res = await fetch("/api/admin/questions/unread-count", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        setQuestionsUnreadCount(Number(json.data?.count) || 0);
      } catch {
        // ignora erro pontual
      }
    }
    void loadQuestionsUnread();
    const questionsInterval = setInterval(loadQuestionsUnread, 20000);
    void loadChatUnread();
    const interval = setInterval(loadChatUnread, 8000);
    return () => { clearInterval(interval); clearInterval(questionsInterval); };
  }, []);

  const canEditMember = (currentRole: AdminRole | null, targetRole: string | undefined): boolean => {
    if (!currentRole || !targetRole) return false;
    const currentLevel = roleHierarchy[currentRole as Role];
    const targetLevel = roleHierarchy[targetRole.toLowerCase() as Role];
    if (currentLevel === undefined || targetLevel === undefined) return false;
    return currentLevel > targetLevel;
  };

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

  const loadCategoryData = useCallback(async () => {
    try {
      setLoadingCategoryData(true);
      const res = await fetch("/api/categories/data");
      if (!res.ok) return;
      const json = await res.json();

      setCategoryData({
        categories: json.data?.categories || [],
        sections: json.data?.sections || [],
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingCategoryData(false);
    }
  }, []);

  const loadAdmins = useCallback(async () => {
    const response = await fetch("/api/admins", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setAdmins(data.data ?? []);
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
    } catch (err: any) {
      setAddError(err?.message || "Erro de rede.");
    } finally {
      setAddBusy(false);
    }
  }

  async function handleEditConfirm() {
    if (!editId) return;

    setEditBusy(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/admins/edit/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: editRole }),
      });

      const json = await res.json();

      if (!res.ok) {
        setEditError(json.error || "Erro ao editar membro.");
        return;
      }

      setAdmins((prev) =>
        prev.map((admin) =>
          admin.id === editId ? { ...admin, role: editRole } : admin
        )
      );

      closeEdit();
    } catch (err: any) {
      setEditError(err.message || "Erro de rede.");
    } finally {
      setEditBusy(false);
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
    } catch (err: any) {
      setRemoveError(err?.message || "Erro de rede.");
    } finally {
      setRemoveBusy(false);
    }
  }

  function openEdit(admin: Admin) {
    if (!currentUserRole || !canEditMember(currentUserRole, admin.role as AdminRole)) {
      setEditError("Você não tem permissão para editar este membro.");
      setIsEditOpen(true);
      return;
    }
    setEditId(admin.id);
    setEditEmail(admin.email);
    setEditRole((admin.role as AdminRole) || "editor");
    setEditError(null);
    setIsEditOpen(true);
  }

  function closeEdit() {
    setIsEditOpen(false);
    setEditId(null);
    setEditEmail("");
    setEditRole("editor");
    setEditError(null);
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
        ? `/api/${itemType}?name=${encodeURIComponent(query.trim())}`
        : `/api/${itemType}`;

      const res = await fetch(url, { method: "GET" });

      if (!res.ok) {
        setItemsError("Falha ao carregar dados.");
        setItems([]);
        return;
      }

      const json = await res.json();
      const loadedItems = Array.isArray(json.data) ? json.data : [];
      setItems(loadedItems);

      if (itemType === "products" && !query?.trim()) {
        setOrderedProducts(loadedItems);
      }
    } catch {
      setItemsError("Erro de rede.");
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [itemType]);

  // Fetches and applies the store's visual settings. Deliberately does not
  // depend on `colorTarget` — syncing `selectedColor` to the active target
  // is handled by the dedicated effect below, so this fetch only needs to
  // run when the settings themselves need reloading.
  const loadStoreSettings = useCallback(async () => {
    const response = await fetch("/api/store-settings", { cache: "no-store" });
    if (!response.ok) return;

    const json = await response.json();
    const data = json.data ?? {};

    const nextSettings: StoreSettings = {
      primaryColor: String(data.primary_color ?? "#b700ff"),
      secondaryColor: String(data.secondary_color ?? "#6400ff"),
      backgroundType: (data.background_style ?? "heroicons") as BackgroundType,
      backgroundImageUrl: String(data.background_img_url ?? ""),
      backgroundCss: String(data.background_css ?? ""),
      backgroundSolidColor: String(data.background_solid_color ?? "#050505"),
      logoUrl: String(data.logo_url ?? ""),
      storeName: String(data.store_name ?? ""),
    };

    setStoreSettings(nextSettings);

    const root = document.documentElement;
    root.style.setProperty("--primary", nextSettings.primaryColor);
    root.style.setProperty("--secondary", nextSettings.secondaryColor);
    root.style.setProperty("--background-image", nextSettings.backgroundImageUrl ? `url(${nextSettings.backgroundImageUrl})` : "none");

    let styleTag = document.getElementById("dynamic-bg-style") as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "dynamic-bg-style";
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = nextSettings.backgroundCss || "";
  }, []);

  useEffect(() => {
    async function fetchCurrentUserRole() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setCurrentUserRole(data.role as AdminRole);
        }
      } catch (err) {
        console.error("Erro ao buscar role do usuário:", err);
      }
    }
    fetchCurrentUserRole();
  }, []);

  useEffect(() => {
    void loadItems();
    void loadStats();
    void loadStoreSettings();
    void loadAdmins();
    void loadHomeData();
    void loadCategoryData();
  }, [loadItems, loadStoreSettings, loadAdmins, loadHomeData, loadCategoryData]);

  useEffect(() => {
    const delay = setTimeout(() => void loadItems(search), 400);
    return () => clearTimeout(delay);
  }, [search, itemType, loadItems]);

  useEffect(() => {
    setSelectedColor(colorTarget === "primary" ? storeSettings.primaryColor : storeSettings.secondaryColor);
  }, [colorTarget, storeSettings.primaryColor, storeSettings.secondaryColor]);

  // Revoke the background preview object URL when it changes or the
  // component unmounts, to avoid leaking blob URLs.
  useEffect(() => {
    return () => {
      if (backgroundImagePreview) {
        URL.revokeObjectURL(backgroundImagePreview);
      }
    };
  }, [backgroundImagePreview]);

  function handleEdit(slugOrId: string | number | undefined) {
    if (!slugOrId) return;
    router.push(`/dashboard/${itemType}/edit/${slugOrId}`);
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
      const res = await fetch(`/api/${itemType}/remove/${itemToDelete}`, { method: "DELETE" });
      if (res.ok) {
        closeDeleteModal();
        void loadItems(search);
      } else {
        await modal.alert("Erro ao deletar.");
      }
    } catch {
      await modal.alert("Erro de rede.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function saveStoreName() {
    if (!storeName.trim()) {
      await modal.alert("O nome da loja não pode ser vazio.");
      return;
    }
    const formData = new FormData();
    formData.append("storeName", storeName);

    const response = await fetch("/api/store-settings", {
      method: "POST",
      body: formData,
      cache: "no-store",
    });
    const json = await response.json();

    if (response.ok) {
      await loadStoreSettings();
      setStoreName("");
      openSalvarModal("Nome da loja salvo com sucesso! ", true);
    } else {
      await modal.alert(json?.error || "Erro ao salvar o nome da loja.");
    }
  }

  async function saveLogo() {
    if (!logoFile) return;
    const formData = new FormData();
    formData.append("logoUrl", logoFile);
    const response = await fetch("/api/store-settings", {
      method: "POST",
      body: formData,
      cache: "no-store",
    });

    const json = await response.json();

    if (response.ok) {
      await loadStoreSettings();
      setLogoFile(null);
      openSalvarModal("Logo salva com sucesso! ", true);
    } else {
      await modal.alert(json?.error || "Erro ao salvar a logo.");
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
      openSalvarModal("Cores salvas com sucesso! ");
    } else {
      await modal.alert("Erro ao salvar as cores.");
    }
  }

  async function saveBackground(fileOverride?: File | null, removeImage = false) {
    const formData = new FormData();
    if (removeImage) formData.append("removeBackgroundImage", "1");
    formData.append("backgroundStyle", storeSettings.backgroundType);
    formData.append("backgroundCss", storeSettings.backgroundCss);
    formData.append("backgroundSolidColor", storeSettings.backgroundSolidColor);

    const fileToSend = removeImage ? null : fileOverride !== undefined ? fileOverride : backgroundImageFile;
    if (fileToSend) {
      formData.append("backgroundImage", fileToSend);
    }

    const response = await fetch("/api/store-settings", {
      method: "POST",
      body: formData,
      cache: "no-store",
    });
    if (response.ok) {
      await loadStoreSettings();
      setBackgroundImageFile(null);
      if (backgroundImagePreview) {
        URL.revokeObjectURL(backgroundImagePreview);
      }
      setBackgroundImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      openSalvarModal("Background salvo com sucesso!", true);
    } else {
      await modal.alert("Erro ao salvar o background.");
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
      openSalvarModal("Posições salvas com sucesso!");
    } else {
      await modal.alert("Erro ao salvar as posições.");
    }
  }
  const deleteLabel = itemType === "products" ? "produto" : itemType === "categories" ? "categoria" : "cupom";

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  useEffect(() => {
    async function loadPermissions() {
      try {
        const res = await fetch("/api/auth/permissions");
        const json = await res.json();
        if (json.ok) {
          setPermissions(Array.isArray(json.permissions) ? json.permissions : []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setPermissionsLoading(false);
      }
    }

    void loadPermissions();
  }, []);

  function canAccess(tab: DashboardTab) {
    const permission = TAB_PERMISSIONS[tab];
    return permissions.includes(permission);
  }

  function renderProtected(
    tab: DashboardTab,
    content: React.ReactNode
  ) {
    return (
      <PermissionGuard allowed={canAccess(tab)}>
        {content}
      </PermissionGuard>
    );
  }

  const renderTabContent = () => {
    if (selectedTab === "inicio" && previewSlug) {
      return <ProductPreview slug={previewSlug} onBack={() => setPreviewSlug(null)} />;
    }

    if (selectedTab === "chat") {
      return renderProtected("chat", <StaffChatPanel />);
    }

    if (selectedTab === "pedidos") {
      return renderProtected("pedidos", <OrdersPanel canManage={permissions.includes("orders.manage")} />);
    }

    if (selectedTab === "transportadoras") {
      return renderProtected(
        "transportadoras",
        <ShippingCarriersPanel canManageCredentials={permissions.includes("shipping.credentials")} />
      );
    }

    if (selectedTab === "pagamentos") {
      return renderProtected("pagamentos", <PaymentsSettingsPanel />);
    }

    if (selectedTab === "templates") {
      return renderProtected("templates", <TemplatesPanel />);
    }

    if (selectedTab === "avaliacoes") {
      return renderProtected("avaliacoes", <ReviewsPanel />);
    }

    if (selectedTab === "perguntas") {
      return renderProtected("perguntas", <QuestionsPanel />);
    }

    if (selectedTab === "revendedores") {
      return renderProtected("revendedores", <ResellersPanel />);
    }

    if (selectedTab === "geral") {
      return renderProtected("geral", <GeneralSettingsPanel />);
    }

    if (selectedTab === "registrosEstoque") {
      return renderProtected("registrosEstoque", <StockMovementsPanel />);
    }

    if (selectedTab === "estoque") {
      return renderProtected(
        "estoque",
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
      return renderProtected(
        "inicio",
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

    if (selectedTab === "infos") {
      return renderProtected(
        "infos",
        <section className="settingsPanel">
          <div className="previewHeader">
            <h3>Informações da loja</h3>
          </div>

          <div className="homePreviewWrapper">
            <div className="browserToolbar"></div>

            <div className="previewScrollContainer">
              <div className="previewRealSize">

                <div className="infoGrid">

                  <div className="infoCard">
                    <div className="infoCardHeader">
                      <span className="infoCardIcon"><Icon name="image" /></span>
                      <div>
                        <h4 className="infoCardTitle">Logo da loja</h4>
                        <p className="infoCardSubtitle">PNG, JPG ou WEBP — até 5MB, recomendado: 150x150px, máx: 1024x1024px</p>
                      </div>
                    </div>

                    <div className="infoCardBody">
                      <div className="logoPreviewBox">
                        {storeSettings.logoUrl ? (
                          <img
                            src={storeSettings.logoUrl}
                            alt="Logo atual"
                            className="logoThumb"
                          />
                        ) : (
                          <div className="logoThumbEmpty">Sem logo</div>
                        )}
                        <span className="logoThumbLabel">
                          {storeSettings.logoUrl ? "Logo atual" : "Nenhuma logo enviada"}
                        </span>
                      </div>

                      <label htmlFor="logoFileInput" className="inputlogo">
                        <input
                          id="logoFileInput"
                          className="inputlogoHidden"
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];

                            if (!file) return;

                            if (file.size > 5 * 1024 * 1024) {
                              await modal.alert("O arquivo deve ser menor que 5MB.");
                              return;
                            }

                            const img = new Image();
                            const objectUrl = URL.createObjectURL(file);

                            img.onload = async () => {
                              const width = img.width;
                              const height = img.height;

                              URL.revokeObjectURL(objectUrl);

                              if (width > 1024 || height > 1024) {
                                await modal.alert("A imagem deve ter no máximo 1024x1024 pixels.");
                                return;
                              }

                              setLogoFile(file);
                            };

                            img.onerror = async () => {
                              URL.revokeObjectURL(objectUrl);
                              await modal.alert("Não foi possível ler a imagem selecionada.");
                            };

                            img.src = objectUrl;
                          }}
                        /> <p>Clique ou arraste uma imagem aqui</p>
                        <span className="inputlogoIcon"><Icon name="folder" /></span>
                        <span className="inputlogoText">
                          {logoFile ? logoFile.name : "Clique ou arraste uma imagem aqui"}
                        </span>
                      </label>

                      {logoFile && (
                        <p className="infoCardHint">Arquivo selecionado: {logoFile.name}</p>
                      )}

                      <button className="btn btnPrimaryAction" onClick={() => void saveLogo()} disabled={!logoFile}>
                        Salvar logo
                      </button>
                    </div>
                  </div>

                  <div className="infoCard">
                    <div className="infoCardHeader">
                      <span className="infoCardIcon"><Icon name="tag" /></span>
                      <div>
                        <h4 className="infoCardTitle">Nome da loja</h4>
                        <p className="infoCardSubtitle">Como sua loja aparece para os clientes</p>
                      </div>
                    </div>

                    <div className="infoCardBody">
                      <label className="fieldLabelModern">Nome atual</label>

                      <input
                        type="text"
                        value={storeName ?? ""}
                        placeholder={storeSettings.storeName || "Nome da loja"}
                        onChange={(e) => setStoreName(e.target.value)}
                        className="settingsInput inputModern"
                      />

                      <button className="btn btnPrimaryAction" onClick={() => void saveStoreName()} disabled={!storeName.trim()}>
                        Salvar nome da loja
                      </button>
                    </div>
                  </div>

                </div>

              </div>
            </div>
          </div>
        </section>
      );
    }

    if (selectedTab === "cores") {
      return renderProtected(
        "cores",
        <section className="settingsPanel">
          <div className="previewHeader">
            <h3>Cores da loja</h3>
          </div>

          <div className="homePreviewWrapper">
            <div className="browserToolbar"></div>

            <div className="previewScrollContainer">
              <div className="previewRealSize">

                <div className="colorSection">
                  <label className="fieldLabel">Grupo de cor</label>

                  <select
                    value={colorTarget}
                    onChange={(e) => setColorTarget(e.target.value as "primary" | "secondary")}
                    className="settingsInput modernSelect"
                  >
                    <option value="primary">Cor Primária</option>
                    <option value="secondary">Cor Secundária</option>
                  </select>

                  <div
                    onClick={() => {
                      const colorInput = document.getElementById('colorInput') as HTMLInputElement;
                      colorInput?.click();
                    }}
                    className="colorPickerContainer">
                    <div
                      className="colorSwatch"
                      style={{ backgroundColor: selectedColor }}
                      onClick={() => {
                        const colorInput = document.getElementById('colorInput') as HTMLInputElement;
                        colorInput?.click();
                      }}
                    />

                    <input
                      id="colorInput"
                      type="color"
                      value={selectedColor}
                      onChange={(e) => setSelectedColor(e.target.value)}
                      className="hiddenColorInput"
                    />

                    <div className="colorInfo">
                      <span className="hexValue">{selectedColor.toUpperCase()}</span>
                      <span className="colorLabel">
                        {colorTarget === "primary" ? "Primária" : "Secundária"}
                      </span>
                    </div>
                  </div>

                  <button className="btn saveColorBtn" onClick={() => void saveColors()}>
                    Salvar cores
                  </button>
                </div>

              </div>
            </div>
          </div>
        </section>
      );
    }

    if (selectedTab === "background") {
      return renderProtected(
        "background",
        <section className="settingsPanel">
          <div className="previewHeader">
            <h3>Background</h3>
          </div>

          <div className="homePreviewWrapper">
            <div className="browserToolbar"></div>

            <div className="previewScrollContainer">
              <div className="previewRealSize">

                <div className="backgroundGrid">
                  {backgrounds.map((bg) => {
                    const currentBgType = storeSettings?.backgroundType || "none";
                    const isActive = currentBgType === bg;

                    return (
                      <button
                        key={bg}
                        type="button"
                        className={`bgThumb ${isActive ? "active" : ""}`}
                        onClick={() =>
                          setStoreSettings((p) => ({
                            ...p,
                            backgroundType: bg as BackgroundType,
                          }))
                        }
                      >
                        <p className="bgLabel">
                          {backgroundLabels[bg] || "Nenhum"}
                        </p>

                        <div
                          className="bgPreview"
                          style={resolvePattern(bg, storeSettings.secondaryColor, storeSettings.backgroundSolidColor)}
                        />

                        <span>{bg}</span>
                      </button>
                    );
                  })}
                </div>

                <p className="fieldLabel">Cor de fundo da loja</p>
                <div className="bgPaletteGrid">
                  {BG_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      className={`bgPaletteSwatch ${storeSettings.backgroundSolidColor.toLowerCase() === c ? "active" : ""}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setStoreSettings((p) => ({ ...p, backgroundSolidColor: c }))}
                    />
                  ))}
                  <label className="bgPaletteCustom" title="Escolher outra cor">
                    <input
                      type="color"
                      value={storeSettings.backgroundSolidColor}
                      onChange={(e) => setStoreSettings((p) => ({ ...p, backgroundSolidColor: e.target.value }))}
                    />
                    <span>＋</span>
                  </label>
                </div>
                <p className="helperText">
                  Cor atual: <strong>{storeSettings.backgroundSolidColor.toUpperCase()}</strong> — fica por trás do
                  padrão escolhido acima. Clique em &quot;Salvar background&quot; pra aplicar.
                </p>

                <p className="fieldLabel">Imagem de fundo</p>

                <div className="logoPreviewBox">
                  {backgroundImagePreview ? (
                    <img
                      src={backgroundImagePreview}
                      alt="Preview do background selecionado"
                      className="logoThumb"
                    />
                  ) : storeSettings.backgroundImageUrl ? (
                    <img
                      src={storeSettings.backgroundImageUrl}
                      alt="Background atual"
                      className="logoThumb"
                    />
                  ) : (
                    <div className="logoThumbEmpty">Sem imagem</div>
                  )}
                  <span className="logoThumbLabel">
                    {backgroundImageFile
                      ? backgroundImageFile.name
                      : storeSettings.backgroundImageUrl
                        ? "Background atual"
                        : "Nenhuma imagem enviada"}
                  </span>
                </div>

                <label className="fileInputBtn">
                  <Icon name="upload" />
                  <span>{backgroundImageFile ? "Trocar arquivo" : "Selecionar arquivo"}</span>
                <input
                  key="isolated-file-input"
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setBackgroundImageFile(file);

                    if (backgroundImagePreview) {
                      URL.revokeObjectURL(backgroundImagePreview);
                    }

                    setBackgroundImagePreview(file ? URL.createObjectURL(file) : null);
                  }}
                />
                </label>

                <div className="bgActions">
                  <button
                    className="btn"
                    onClick={() => {
                      const file = fileInputRef.current?.files?.[0] || null;
                      void saveBackground(file);
                    }}
                  >
                    Salvar background
                  </button>
                  {(storeSettings.backgroundImageUrl || backgroundImageFile) && (
                    <button
                      className="btnDanger"
                      type="button"
                      onClick={async () => {
                        if (!storeSettings.backgroundImageUrl) {
                          setBackgroundImageFile(null);
                          setBackgroundImagePreview(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                          return;
                        }
                        if (await modal.confirm("Remover a imagem de fundo? A loja passa a usar só a cor sólida e o padrão escolhidos.", { danger: true })) {
                          await saveBackground(null, true);
                        }
                      }}
                    >
                      <Icon name="trash" /> Remover imagem
                    </button>
                  )}
                </div>

              </div>
            </div>
          </div>
        </section>
      );
    }

    if (selectedTab === "posicao") {
      return renderProtected(
        "posicao",
        <section className="settingsPanel">
          <div className="previewHeader">
            <h3>Prévia das Categorias</h3>
          </div>

          <div className="homePreviewWrapper">
            <div className="browserToolbar"></div>

            <div className="previewScrollContainer">
              <div className="previewRealSize">
                {loadingCategoryData ? (
                  <div className="previewPlaceholder">Carregando visualização...</div>
                ) : (
                  <CategoryPreview
                    categories={categoryData.categories}
                    sections={categoryData.sections}
                    isPreview={true}
                  />
                )}
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (selectedTab === "equipe") {
      return renderProtected("equipe", <TeamPanel />);
    }

    return null;
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
          <button
            type="button"
            className="statsChartsToggle"
            onClick={() => setShowStatsCharts((prev) => !prev)}
          >
            {showStatsCharts ? "Ocultar gráficos ▴" : "Ver gráficos ▾"}
          </button>
        </div>

        {showStatsCharts && <StatsPanel />}
      </header>

      <main className="content">
        <section className="mainArea">
          <div className="dashboardBuilder">
            <Sidebar
              selectedTab={selectedTab}
              onSelect={setSelectedTab}
              permissions={permissions}
              permissionsLoading={permissionsLoading}
              chatUnreadCount={chatUnreadCount}
              questionsUnreadCount={questionsUnreadCount}
            />
            <div className="tabContentContainer" key={selectedTab}>{renderTabContent()}</div>
          </div>
        </section>

        <aside className="sidebar">
          <div className="searchRow">
            <button className="iconBtn iconAdd" onClick={() => router.push(`/dashboard/${itemType}/add`)}>+</button>
            <input className="searchInput" placeholder="Pesquisar..." value={search ?? ""} onChange={(e) => setSearch(e.target.value)} />
            <button className="iconBtn iconRefresh" onClick={() => void loadItems()}>⟳</button>
            <select className="searchSelect" value={itemType ?? ""} onChange={(e) => setItemType(e.target.value as TypeKey)}>
              <option value="products">Produtos</option>
              <option value="categories">Categorias</option>
              <option value="coupon">Cupons</option>
            </select>
          </div>

          <div className="productList">
            {loadingItems && <div>Carregando...</div>}
            {!loadingItems && paginatedItems.map((item) => (
              <div className="productItem" key={item.id}>
                <a onClick={() => {
                  if (itemType === "products") {
                    // slug ausente/vazio (produto antigo) cai pro id — a API aceita os dois
                    setPreviewSlug(String(item.slug || item.id));
                    setSelectedTab("inicio");
                  }
                }}>
                  {item.name || item.code}
                </a>
                <div className="productActions">
                  <button className="iconBtn iconEdit" onClick={() => handleEdit(item.slug ?? item.id)}><Icon name="edit" /></button>
                  <button className="iconBtn iconRemove" onClick={() => openDeleteModal(item.id)}><Icon name="x" /></button>
                </div>
              </div>
            ))}
            {!loadingItems && itemsError && <div className="errorText">{itemsError}</div>}
            {!loadingItems && totalPages > 1 && (
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
          </div>
        </aside>
      </main>

      {isDeleteOpen && (
        <div className="modalOverlay" onClick={closeDeleteModal}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <div className="modalIcon"><Icon name="check" /></div>
            <h3>Confirmar exclusão</h3>
            <p>Tem certeza que deseja deletar este {deleteLabel}?</p>
            <div className="modalActions">
              <button className="btnCancel" onClick={closeDeleteModal} disabled={isDeleting}>Cancelar</button>
              <button className="btnConfirm" onClick={() => void confirmDelete()} disabled={isDeleting}>
                {isDeleting ? "Deletando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isSalvarOpen && (
        <div className="modalOverlay" onClick={closeSalvarModal}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <div className="modalIcon"><Icon name="check" /></div>
            <h3>{modalMessage}</h3>
            <div className="modalActions">
              <button className="btnConfirm" onClick={closeSalvarModal}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}