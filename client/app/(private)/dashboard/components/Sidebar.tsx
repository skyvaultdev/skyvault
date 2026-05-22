"use client";

import { useEffect, useState } from "react";

export type DashboardTab = "inicio"
  | "cores"
  | "background"
  | "posicao"
  | "estoque"
  | "equipe";

type SidebarProps = {
  selectedTab: DashboardTab;
  onSelect: (tab: DashboardTab) => void;
};

const MENU_ITEMS: Array<{ key: DashboardTab; label: string; permission: string }> = [
  {
    key: "inicio",
    label: "Início",
    permission: "dashboard.access",
  },
  {
    key: "cores",
    label: "Cores da loja",
    permission: "store.customize",
  },
  {
    key: "background",
    label: "Background",
    permission: "store.customize",
  },
  {
    key: "posicao",
    label: "Posição Categorias",
    permission: "products.write",
  },
  {
    key: "estoque",
    label: "Estoque",
    permission: "products.write",
  },
  {
    key: "equipe",
    label: "Equipe",
    permission: "team.manage",
  },
];

export default function Sidebar({ selectedTab, onSelect, }: SidebarProps) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      }
    }

    void loadPermissions();
  }, []);

  function hasPermission(permission: string) {
    return permissions.includes(permission);
  }
  return (
    <nav
      className="settingsSidebar"
      aria-label="Menu de configurações"
    >
      {MENU_ITEMS.map((item) => {
        const allowed = hasPermission(item.permission);
        return (
          <button
            key={item.key}
            type="button"
            disabled={!allowed || loading}
            className={`
              settingsMenuItem
              ${selectedTab === item.key ? "active" : ""}
              ${!allowed ? "disabled" : ""}
            `}
            onClick={() => {
              if (!allowed) return;
              onSelect(item.key);
            }}
            aria-label={item.label}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}