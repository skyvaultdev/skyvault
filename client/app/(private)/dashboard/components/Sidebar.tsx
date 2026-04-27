"use client";

export type DashboardTab = "inicio" | "cores" | "background" | "posicao" | "estoque" | "equipe";
import { cookies } from 'next/headers';
import { hasPermission } from "@/lib/jwt/init";

type SidebarProps = {
  selectedTab: DashboardTab;
  onSelect: (tab: DashboardTab) => void;
};

const MENU_ITEMS: Array<{ key: DashboardTab; label: string, permission: string }> = [
  { key: "inicio", label: "Início", permission: "owner" },
  { key: "cores", label: "Cores da loja", permission: "owner" },
  { key: "background", label: "Background", permission: "owner" },
  { key: "posicao", label: "Posição", permission: "owner" },
  { key: "estoque", label: "Estoque", permission: "owner" },
  { key: "equipe", label: "Equipe", permission: "owner" },
];


const cookieStore = await cookies();
const token = cookieStore.get('auth_token')?.value as any;

export default function Sidebar({ selectedTab, onSelect }: SidebarProps) {
  return (
    <nav className="settingsSidebar" aria-label="Menu de configurações">
      {MENU_ITEMS.map(async (item) => {
        const allowed = await hasPermission(token, item.permission);

        return (
          <button
            key={item.key}
            type="button"
            disabled={!allowed}
            className={`settingsMenuItem ${selectedTab === item.key ? "active" : ""} ${!allowed ? "disabled" : ""}`}
            onClick={() => allowed && onSelect(item.key)}
            aria-label={item.label}
            style={{
              opacity: allowed ? 1 : 0.5,
              cursor: allowed ? "pointer" : "not-allowed"
            }}
          >
            {item.label} {!allowed && "🔒"}
          </button>
        );
      })}
    </nav>
  );
}
