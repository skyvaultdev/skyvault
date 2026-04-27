"use client";

export type DashboardTab = "inicio" | "cores" | "background" | "posicao" | "estoque" | "equipe";

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

export default function Sidebar({ selectedTab, onSelect }: SidebarProps) {
  return (
    <nav className="settingsSidebar" aria-label="Menu de configurações">
      {MENU_ITEMS.map((item) => {
        return (
          <button
            key={item.key}
            type="button"
            className={`settingsMenuItem ${selectedTab === item.key ? "active" : "disbaled"}`}
            onClick={() => onSelect(item.key)}
            aria-label={item.label}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}