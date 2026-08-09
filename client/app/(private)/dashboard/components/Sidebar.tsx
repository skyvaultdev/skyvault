"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "@/components/chat/ChatShared.css";

export type DashboardTab = "inicio"
  | "infos"
  | "cores"
  | "background"
  | "posicao"
  | "estoque"
  | "chat"
  | "equipe";

// Keeping this as a literal union (instead of a bare `string`) means a typo
// like "dashbord.access" fails at compile time instead of silently locking
// a tab forever.
export type Permission =
  | "dashboard.access"
  | "store.customize"
  | "products.write"
  | "chat.access"
  | "team.manage";

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
};

const MENU_ITEMS: Array<{ key: DashboardTab; label: string; permission: Permission }> = [
  { key: "inicio", label: "Início", permission: "dashboard.access" },
  { key: "infos", label: "Informações", permission: "dashboard.access" },
  { key: "cores", label: "Cores da loja", permission: "store.customize" },
  { key: "background", label: "Background", permission: "store.customize" },
  { key: "posicao", label: "Posição Categorias", permission: "products.write" },
  { key: "estoque", label: "Estoque", permission: "products.write" },
  { key: "chat", label: "Chat", permission: "chat.access" },
  { key: "equipe", label: "Equipe", permission: "team.manage" },
];

export default function Sidebar({
  selectedTab,
  onSelect,
  permissions: permissionsProp,
  permissionsLoading: permissionsLoadingProp,
  chatUnreadCount = 0,
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

  return (
    <nav className="settingsSidebar" aria-label="Menu de configurações">
      {MENU_ITEMS.map((item) => {
        const allowed = hasPermission(item.permission);
        const isActive = selectedTab === item.key;

        const className = [
          "settingsMenuItem",
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
            {item.label}
            {item.key === "chat" && chatUnreadCount > 0 && (
              <span className="sidebarUnreadBadge">{chatUnreadCount}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}