import Sidebar, { DashboardTab } from '../Sidebar';
import { cookies } from 'next/headers';
import { hasPermission } from "@/lib/jwt/init";

const ALL_MENU_ITEMS: Array<{ key: DashboardTab; label: string, permission: string }> = [
  { key: "inicio", label: "Início", permission: "owner" },
  { key: "cores", label: "Cores da loja", permission: "owner" },
  { key: "background", label: "Background", permission: "owner" },
  { key: "posicao", label: "Posição", permission: "owner" },
  { key: "estoque", label: "Estoque", permission: "owner" },
  { key: "equipe", label: "Equipe", permission: "owner" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  const menuWithPermissions = await Promise.all(
    ALL_MENU_ITEMS.map(async (item) => ({
      key: item.key,
      label: item.label,
      allowed: await hasPermission(token, item.permission) 
    }))
  );

  return (
    <div className="dashboard-layout">
      <Sidebar 
        menuItems={menuWithPermissions} 
        onSelect={() => {}}
        selectedTab="inicio" 
      />
      <main>{children}</main>
    </div>
  );
}