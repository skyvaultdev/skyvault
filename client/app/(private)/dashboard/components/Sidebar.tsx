"use client";

export type DashboardTab = "inicio" | "cores" | "background" | "posicao" | "equipe";

type SidebarProps = {
  selectedTab: DashboardTab;
  onSelect: (tab: DashboardTab) => void;
};

const MENU_ITEMS: Array<{ key: DashboardTab; label: string }> = [
  { key: "inicio", label: "Início" },
  { key: "cores", label: "Cores da loja" },
  { key: "background", label: "Background" },
  { key: "posicao", label: "Posição" },
  { key: "equipe", label: "Equipe" },
];

export default function Sidebar({ selectedTab, onSelect }: SidebarProps) {
  return (
    <nav className="settingsSidebar" aria-label="Menu de configurações">
      {MENU_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`settingsMenuItem ${selectedTab === item.key ? "active" : ""}`}
          onClick={() => onSelect(item.key)}
          aria-label={item.label}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
