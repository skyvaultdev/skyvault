"use client";

import { useCallback, useEffect, useState } from "react";
import "./StockMovementsPanel.css";

type StockMovement = {
  id: number;
  product_id: number | null;
  variation_id: number | null;
  product_name: string;
  variation_name: string | null;
  change: number;
  reason: "sale" | "cancel_restock" | "manual_adjustment" | "product_created";
  order_id: number | null;
  order_number: string | null;
  note: string | null;
  staff_email: string | null;
  created_at: string;
  thumbnail_url: string | null;
};

const REASON_LABELS: Record<StockMovement["reason"], string> = {
  sale: "Venda",
  cancel_restock: "Estorno (cancelamento)",
  manual_adjustment: "Ajuste manual",
  product_created: "Cadastro inicial",
};

const REASON_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos" },
  { value: "sale", label: "Vendas" },
  { value: "cancel_restock", label: "Estornos" },
  { value: "manual_adjustment", label: "Ajustes manuais" },
  { value: "product_created", label: "Cadastros" },
];

const DIRECTION_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Entradas e saídas" },
  { value: "in", label: "Só entradas" },
  { value: "out", label: "Só saídas" },
];

function displayOrderNumber(orderId: number, orderNumber: string | null) {
  return orderNumber || `LEGADO-${orderId}`;
}

export default function StockMovementsPanel() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");

  const load = useCallback(async (targetPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (reasonFilter) params.set("reason", reasonFilter);
      if (directionFilter) params.set("direction", directionFilter);
      params.set("page", String(targetPage));
      params.set("pageSize", String(PAGE_SIZE));
      const res = await fetch(`/api/admin/stock-movements?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data && Array.isArray(json.data.items)) {
        setMovements(json.data.items);
        setTotal(json.data.total ?? 0);
        setPage(json.data.page ?? targetPage);
      } else {
        setMovements([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [search, reasonFilter, directionFilter]);

  useEffect(() => {
    void load(1);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Registros Estoque</h3>
        <p className="helperText">
          Tudo que entra e sai do estoque — vendas, estornos de cancelamento e ajustes manuais — com o produto,
          a variação e o pedido envolvidos.
        </p>
      </div>

      <div className="searchContainer stockMovFilterRow">
        <input
          type="text"
          placeholder="Buscar por produto, variação ou nº do pedido..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="searchInput"
        />
      </div>

      <div className="quickFilterChips">
        {DIRECTION_FILTERS.map((f) => (
          <button
            key={f.value}
            className={`quickFilterChip ${directionFilter === f.value ? "active" : ""}`}
            onClick={() => setDirectionFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="quickFilterChips">
        {REASON_FILTERS.map((f) => (
          <button
            key={f.value}
            className={`quickFilterChip ${reasonFilter === f.value ? "active" : ""}`}
            onClick={() => setReasonFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="loadingMsg">Carregando registros...</p>}
      {!loading && movements.length === 0 && (
        <p className="emptyMsg">
          {search || reasonFilter || directionFilter ? "Nenhum registro encontrado com esses filtros." : "Nenhuma movimentação de estoque ainda."}
        </p>
      )}

      <div className="stockMovList">
        {movements.map((m) => {
          const isIn = m.change > 0;
          return (
            <div key={m.id} className="stockMovRow">
              <img src={m.thumbnail_url || "/file.svg"} alt="" className="stockMovThumb" />

              <div className="stockMovInfo">
                <span className="stockMovProductName">
                  {m.product_name}{m.variation_name ? ` — ${m.variation_name}` : ""}
                </span>
                <span className="stockMovMeta">
                  <span className={`stockMovReasonBadge reason-${m.reason}`}>{REASON_LABELS[m.reason]}</span>
                  {m.order_id && (
                    <span className="stockMovOrderRef">Pedido {displayOrderNumber(m.order_id, m.order_number)}</span>
                  )}
                  {m.staff_email && <span className="stockMovStaff">por {m.staff_email}</span>}
                </span>
                {m.note && <span className="stockMovNote">{m.note}</span>}
              </div>

              <div className="stockMovRight">
                <span className={`stockMovChange ${isIn ? "in" : "out"}`}>
                  {isIn ? "+" : ""}{m.change}
                </span>
                <span className="stockMovDate">
                  {new Date(m.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && total > PAGE_SIZE && (
        <div className="ordersPagination">
          <button className="btnSecondary" disabled={page <= 1} onClick={() => load(page - 1)}>← Anterior</button>
          <span className="ordersPaginationInfo">Página {page} de {totalPages} · {total} registro(s)</span>
          <button className="btnSecondary" disabled={page >= totalPages} onClick={() => load(page + 1)}>Próxima →</button>
        </div>
      )}
    </section>
  );
}
