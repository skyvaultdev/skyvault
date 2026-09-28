"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "@/components/chat/ChatShared.css";
import Icon, { type IconName } from "@/components/icons/Icon";

export type DashboardTab = "inicio"
  | "infos"
  | "cores"
  | "background"
  | "posicao"
  | "estoque"
  | "registrosEstoque"
  | "perguntas"
  | "avaliacoes"
  | "chat"
  | "equipe"
  | "pedidos"
  | "transportadoras"
  | "pagamentos"
  | "revendedores"
  | "templates"
  | "geral";


export type Permission =
  | "dashboard.access"
  | "store.customize"
  | "products.write"
  | "chat.access"
  | "team.manage"
  | "orders.read"
  | "orders.manage"
  | "shipping.manage"
  | "shipping.credentials"
  | "payments.manage"
  | "resellers.manage";

type SidebarProps = {
  selectedTab: DashboardTab;
  onSelect: (tab: DashboardTab) => void;
  /**
   * Optional: pass these down from a parent that already fetched
   * permissions (e.g. the Dashboard page) to avoid firing a second,
   * redundant request to /api/auth/permissions. If omitted, Sidebar
   * fetches them itself.
   */
  permissions?: Permission[];
  permissionsLoading?: boolean;
  chatUnreadCount?: number;
  questionsUnreadCount?: number;
};

type MenuItem = { key: DashboardTab; label: string; permission: Permission; icon: IconName };
type MenuGroup = { title: string; items: MenuItem[] };

const MENU_GROUPS: MenuGroup[] = [
  {
    title: "Visão geral",
    items: [
      { key: "inicio", label: "Início", permission: "dashboard.access", icon: "home" },
      { key: "infos", label: "Informações", permission: "dashboard.access", icon: "info" },
    ],
  },
  {
    title: "Aparência da loja",
    items: [
      { key: "cores", label: "Cores da loja", permission: "store.customize", icon: "palette" },
      { key: "background", label: "Background", permission: "store.customize", icon: "image" },
      { key: "templates", label: "Templates da home", permission: "store.customize", icon: "layout" },
      { key: "geral", label: "Geral", permission: "store.customize", icon: "settings" },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { key: "posicao", label: "Posição Categorias", permission: "products.write", icon: "layers" },
      { key: "estoque", label: "Estoque", permission: "products.write", icon: "box" },
      { key: "registrosEstoque", label: "Registros Estoque", permission: "products.write", icon: "clipboard" },
    ],
  },
  {
    title: "Vendas",
    items: [
      { key: "pedidos", label: "Pedidos", permission: "orders.read", icon: "receipt" },
      { key: "transportadoras", label: "Transportadoras", permission: "shipping.manage", icon: "truck" },
      { key: "pagamentos", label: "Pagamentos", permission: "payments.manage", icon: "card" },
      { key: "revendedores", label: "Revendedores", permission: "resellers.manage", icon: "handshake" },
    ],
  },
  {
    title: "Atendimento",
    items: [
      { key: "chat", label: "Chat", permission: "chat.access", icon: "chat" },
      { key: "perguntas", label: "Perguntas", permission: "products.write", icon: "help" },
      { key: "avaliacoes", label: "Avaliações", permission: "products.write", icon: "star" },
    ],
  },
  {
    title: "Administração",
    items: [{ key: "equipe", label: "Equipe", permission: "team.manage", icon: "shield" }],
  },
];

export default function Sidebar({
  selectedTab,
  onSelect,
  permissions: permissionsProp,
  permissionsLoading: permissionsLoadingProp,
  chatUnreadCount = 0,
  questionsUnreadCount = 0,
}: SidebarProps) {
  const isControlled = permissionsProp !== undefined;

  const [internalPermissions, setInternalPermissions] = useState<Permission[]>([]);
  const [internalLoading, setInternalLoading] = useState(!isControlled);

  useEffect(() => {
    // Parent is already supplying permissions — don't duplicate the fetch.
    if (isControlled) return;

    const controller = new AbortController();

    async function loadPermissions() {
      try {
        const res = await fetch("/api/auth/permissions", { signal: controller.signal });
        const json = await res.json();
        if (json.ok) {
          setInternalPermissions(Array.isArray(json.permissions) ? json.permissions : []);
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          console.error(err);
        }
      } finally {
        setInternalLoading(false);
      }
    }

    void loadPermissions();
    return () => controller.abort();
  }, [isControlled]);

  const permissions = isControlled ? (permissionsProp ?? []) : internalPermissions;
  const loading = isControlled ? (permissionsLoadingProp ?? false) : internalLoading;

  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const hasPermission = useCallback(
    (permission: Permission) => permissionSet.has(permission),
    [permissionSet]
  );

  const badgeFor = (key: DashboardTab) => (key === "chat" ? chatUnreadCount : key === "perguntas" ? questionsUnreadCount : 0);

  return (
    <nav className="settingsSidebar" aria-label="Menu de configurações">
      {MENU_GROUPS.map((group) => (
        <div key={group.title} className="settingsMenuGroup">
          <span className="settingsMenuGroupTitle">{group.title}</span>
          {group.items.map((item) => {
            const allowed = hasPermission(item.permission);
            const isActive = selectedTab === item.key;
            const badge = badgeFor(item.key);

            const className = [
              "settingsMenuItem",
              item.key === "chat" && "settingsMenuItemChat",
              isActive && "active",
              !allowed && "disabled",
            ].filter(Boolean).join(" ");

            return (
              <button
                key={item.key}
                type="button"
                disabled={!allowed || loading}
                className={className}
                onClick={() => {
                  if (!allowed) return;
                  onSelect(item.key);
                }}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                aria-disabled={!allowed}
              >
                <Icon name={item.icon} size="1.15em" className="settingsMenuIcon" />
                <span className="settingsMenuLabel">{item.label}</span>
                {badge > 0 && <span className="sidebarUnreadBadge">{badge}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
