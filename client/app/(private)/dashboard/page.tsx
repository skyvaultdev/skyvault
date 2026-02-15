"use client";

import "./dashboard.css";
import "./modal.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TypeKey = "products" | "categories" | "coupon";

type Item = {
  id: number;
  name: string;
  slug?: string;
};

type Stats = {
  acessos: number;
  vendidos: number;
  arrecadados: number;
};

export default function Dashboard() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeKey>("products");

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState("");

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

      const data = (await res.json()) as Partial<Stats>;

      setStats({
        acessos: Number(data.acessos) || 0,
        vendidos: Number(data.vendidos) || 0,
        arrecadados: Number(data.arrecadados) || 0,
      });
    } catch {
      setStatsError("Erro de rede ao carregar estatísticas.");
      setStats({ acessos: 0, vendidos: 0, arrecadados: 0 });
    } finally {
      setLoadingStats(false);
    }
  }

  async function loadItems(query?: string) {
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

      const json = await res.json();

      const data = (json.product ?? json.products ?? json.items ?? json.data) as Item[];

      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItemsError("Erro de rede.");
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => {
    loadItems();
    loadStats();
  }, []);

  useEffect(() => {
    const delay = setTimeout(() => {
      loadItems(search);
    }, 400);

    return () => clearTimeout(delay);
  }, [search, type]);

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

      const res = await fetch(`/api/${type}/remove/${itemToDelete}`, {
        method: "DELETE",
      });

      if (res.ok) {
        closeDeleteModal();
        loadItems(search);
      } else {
        const msg = await res.text().catch(() => "");
        alert(msg || "Erro ao deletar.");
      }
    } catch {
      alert("Erro de rede.");
    } finally {
      setIsDeleting(false);
    }
  }

  const addButtonLabel =
    type === "products"
      ? "ADICIONAR PRODUTO"
      : type === "categories"
      ? "ADICIONAR CATEGORIA"
      : "ADICIONAR CUPOM";

  const addButtonLink = `/dashboard/${type}/add`;

  const deleteLabel =
    type === "products"
      ? "produto"
      : type === "categories"
      ? "categoria"
      : "cupom";

  return (
    <div className="app">
      <header className="topbar">
        {loadingStats && <div>Carregando estatísticas...</div>}
        {statsError && <div>{statsError}</div>}

        <div className="stats">
          <div className="statCard">
            <div className="statValue">
              {stats.acessos.toLocaleString("pt-BR")}
            </div>
            <div className="statLabel">
              ACESSOS
              <br />
              REGISTRADOS
            </div>
          </div>

          <div className="statCard">
            <div className="statValue">
              {stats.vendidos.toLocaleString("pt-BR")}
            </div>
            <div className="statLabel">
              PRODUTOS
              <br />
              VENDIDOS
            </div>
          </div>

          <div className="statCard">
            <div className="statValue">
              R$ {stats.arrecadados.toLocaleString("pt-BR")}
            </div>
            <div className="statLabel">ARRECADADOS</div>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="mainArea">
          <div className="actions">
            <Link href={addButtonLink}>
              <button className="btn btnAdd" type="button">
                {addButtonLabel}
              </button>
            </Link>
          </div>
        </section>

        <aside className="sidebar">
          <div className="searchRow">
            <input
              className="searchInput"
              type="text"
              placeholder="Pesquisar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="searchSelect"
              value={type}
              onChange={(e) => setType(e.target.value as TypeKey)}
            >
              <option value="products">Produtos</option>
              <option value="categories">Categorias</option>
              <option value="coupon">Cupons</option>
            </select>
          </div>

          <div className="productList">
            {loadingItems && <div>Carregando...</div>}
            {itemsError && <div>{itemsError}</div>}
            {!loadingItems && items.length === 0 && (
              <div>Nenhum resultado encontrado</div>
            )}

            {!loadingItems &&
              items.map((item) => (
                <div className="productItem" key={item.id}>
                  <a className="productName">{item.name}</a>

                  <div className="productActions">
                    <button
                      className="iconBtn iconEdit"
                      type="button"
                      onClick={() => handleEdit(item.slug ?? item.id)}
                    >
                      ✎
                    </button>

                    <button
                      className="iconBtn iconRemove"
                      type="button"
                      onClick={() => openDeleteModal(item.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </aside>
      </main>

      {isDeleteOpen && (
        <div className="modalOverlay" onClick={closeDeleteModal}>
          <div
            className="modalBox"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3>Confirmar exclusão</h3>
            <p>Tem certeza que deseja deletar este {deleteLabel}?</p>

            <div className="modalActions">
              <button
                className="btnCancel"
                type="button"
                onClick={closeDeleteModal}
                disabled={isDeleting}
              >
                Cancelar
              </button>

              <button
                className="btnConfirm"
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deletando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}