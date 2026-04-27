"use client";

import "./dashboard.css";
import "./modal.css";
import "./components/homeprev.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar, { type DashboardTab } from "./components/Sidebar";
import DashboardTabs from "./components/DashboardTabs";
import ProductPreview from "./components/ProductPreview";
import HomePreview from "./components/HomePreview";

type TypeKey = "products" | "categories" | "coupon";

type Item = {
  id: number;
  name: string;
  slug?: string;
  variations: [];
  position?: number | null;
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

export default function Dashboard() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeKey>("products");
  const [selectedTab, setSelectedTab] =
    useState<DashboardTab>("inicio");

  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<Stats>({
    acessos: 0,
    vendidos: 0,
    arrecadados: 0,
  });

  const [previewSlug, setPreviewSlug] = useState<string | null>(
    null
  );

  const [homeData, setHomeData] = useState({
    banners: [],
    categories: [],
    sections: [],
    highlights: [],
  });

  const [loadingHomeData, setLoadingHomeData] =
    useState(false);

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

  const loadItems = useCallback(async () => {
    const res = await fetch(`/api/${type}`);

    if (!res.ok) return;

    const json = await res.json();

    setItems(json.data || []);
  }, [type]);

  const loadStats = async () => {
    const res = await fetch("/api/stats");

    if (!res.ok) return;

    const json = await res.json();

    setStats({
      acessos: Number(json.data?.acessos || 0),
      vendidos: Number(json.data?.vendidos || 0),
      arrecadados: Number(json.data?.arrecadados || 0),
    });
  };

  useEffect(() => {
    void loadItems();
    void loadStats();
    void loadHomeData();
  }, [loadItems, loadHomeData]);

  const renderTabContent = () => {
    if (selectedTab === "inicio" && previewSlug) {
      return (
        <ProductPreview
          slug={previewSlug}
          onBack={() => setPreviewSlug(null)}
        />
      );
    }

    if (selectedTab === "inicio") {
      return (
        <section className="settingsPanel">
          <div className="previewHeader">
            <h3>Prévia da Home</h3>

            <button
              className="btnhome"
              onClick={() => void loadHomeData()}
            >
              Atualizar Preview
            </button>
          </div>

          {loadingHomeData ? (
            <div className="previewPlaceholder">
              Carregando visualização...
            </div>
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

    return (
      <section className="settingsPanel">
        Conteúdo restante...
      </section>
    );
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="stats">
          <div className="statCard">
            <div className="statValue">
              {stats.acessos}
            </div>
            <div className="statLabel">ACESSOS</div>
          </div>

          <div className="statCard">
            <div className="statValue">
              {stats.vendidos}
            </div>
            <div className="statLabel">VENDAS</div>
          </div>

          <div className="statCard">
            <div className="statValue">
              R$ {stats.arrecadados}
            </div>
            <div className="statLabel">TOTAL</div>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="mainArea">
          <div className="dashboardBuilder">
            <Sidebar
              selectedTab={selectedTab}
              onSelect={setSelectedTab}
            />

            <div className="tabContentContainer">
              {renderTabContent()}
            </div>
          </div>
        </section>

        <aside className="sidebar">
          <div className="searchRow">
            <button
              className="iconBtn iconAdd"
              onClick={() =>
                router.push(`/dashboard/${type}/add`)
              }
            >
              +
            </button>

            <input
              className="searchInput"
              placeholder="Pesquisar..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />
          </div>

          <div className="productList">
            {items.map((item) => (
              <div
                className="productItem"
                key={item.id}
              >
                <a
                  onClick={() => {
                    if (item.slug) {
                      setPreviewSlug(item.slug);
                      setSelectedTab("inicio");
                    }
                  }}
                >
                  {item.name}
                </a>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

