"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/icons/Icon";
import "./QuestionsPanel.css";

type R = {
  id: number;
  product_name: string;
  reviewer_name: string | null;
  rating: number;
  comment: string | null;
  image_urls: string[];
  hidden: boolean;
  created_at: string;
};

// Moderação de avaliações: ocultar/reexibir (não apaga).
export default function ReviewsPanel() {
  const [items, setItems] = useState<R[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const pageSize = 15;

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reviews?page=${targetPage}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) {
        setItems(json.data.items ?? []);
        setTotal(json.data.total ?? 0);
        setPage(json.data.page ?? targetPage);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  async function toggle(r: R) {
    setBusyId(r.id);
    try {
      await fetch(`/api/admin/reviews/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !r.hidden }),
      });
      await load(page);
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Avaliações</h3>
        <p className="helperText">
          Avaliações dos clientes que compraram. Ocultar tira da página do produto e do cálculo de aprovação.
        </p>
      </div>

      {loading && <p className="helperText">Carregando...</p>}
      {!loading && items.length === 0 && <p className="emptyMsg">Nenhuma avaliação ainda.</p>}

      <div className="qpList">
        {items.map((r) => (
          <div key={r.id} className={`qpCard ${r.hidden ? "hidden" : ""}`}>
            <div className="qpHead">
              <strong>{r.product_name}</strong>
              <span className="helperText">
                {r.reviewer_name ?? "Cliente"} · {new Date(r.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="qpQuestion">{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" fill={n <= r.rating} />)}</p>
            {r.comment && <p className="qpAnswer">{r.comment}</p>}
            {r.image_urls?.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {r.image_urls.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                    <img src={u} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} />
                  </a>
                ))}
              </div>
            )}
            <div className="qpActions">
              <button className="btnSecondary" disabled={busyId === r.id} onClick={() => void toggle(r)}>
                {r.hidden ? "Reexibir" : "Ocultar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {total > pageSize && (
        <div className="qpPager">
          <button className="btnSecondary" disabled={page <= 1} onClick={() => void load(page - 1)}>← Anterior</button>
          <span className="helperText">Página {page} de {totalPages}</span>
          <button className="btnSecondary" disabled={page >= totalPages} onClick={() => void load(page + 1)}>Próxima →</button>
        </div>
      )}
    </section>
  );
}
