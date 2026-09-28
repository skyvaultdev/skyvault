"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/icons/Icon";
import "./reviews.css";

type Review = {
  id: number;
  reviewer_name: string | null;
  rating: number;
  comment: string | null;
  image_urls: string[];
  created_at: string;
};

function Stars({ value }: { value: number }) {
  return (
    <span className="rvStars" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? "on" : ""}><Icon name="star" fill /></span>
      ))}
    </span>
  );
}

// Barra de aprovação (0% ... 100%) e avaliações escritas/com imagens.
export default function ProductReviews({ productId }: { productId: number }) {
  const [total, setTotal] = useState(0);
  const [approval, setApproval] = useState<number | null>(null);
  const [average, setAverage] = useState<number | null>(null);
  const [items, setItems] = useState<Review[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/products/${productId}/reviews?page=${targetPage}`, { cache: "no-store" });
        const json = await res.json();
        if (res.ok && json.data) {
          setTotal(json.data.total);
          setApproval(json.data.approvalPercent);
          setAverage(json.data.average);
          setItems(json.data.items ?? []);
          setPage(json.data.page);
          setPageSize(json.data.pageSize);
        }
      } finally {
        setLoading(false);
      }
    },
    [productId]
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rvSection" id="avaliacoes">
      <h2 className="rvTitle">Avaliações</h2>

      {total === 0 && !loading ? (
        <p className="rvEmpty">Este produto ainda não tem avaliações. Quem comprou pode avaliar em &quot;Meus pedidos&quot;.</p>
      ) : (
        <div className="rvMeter">
          <div className="rvMeterHead">
            <span className="rvMeterPercent">{approval ?? 0}% de aprovação</span>
            <span className="rvMeterSub">
              {average !== null && <><Icon name="star" fill /> {average.toFixed(1)} · </>}
              {total} avaliação(ões)
            </span>
          </div>
          <div className="rvBar">
            <span className="rvBarIcon" title="0%"><Icon name="thumbDown" /></span>
            <div className="rvBarTrack">
              <div className="rvBarFill" style={{ width: `${approval ?? 0}%` }} />
            </div>
            <span className="rvBarIcon" title="100%"><Icon name="star" fill /></span>
          </div>
          <div className="rvBarScale"><span>0%</span><span>100%</span></div>
        </div>
      )}

      <div className="rvList">
        {items.map((r) => (
          <article key={r.id} className="rvItem">
            <div className="rvItemHead">
              <Stars value={r.rating} />
              <span className="rvMeta">
                {r.reviewer_name ?? "Cliente"} · {new Date(r.created_at).toLocaleDateString("pt-BR")}
              </span>
            </div>
            {r.comment && <p className="rvComment">{r.comment}</p>}
            {r.image_urls?.length > 0 && (
              <div className="rvImages">
                {r.image_urls.map((url) => (
                  <button key={url} type="button" className="rvImgBtn" onClick={() => setZoom(url)}>
                    <img src={url} alt="Foto da avaliação" />
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {total > pageSize && (
        <div className="rvPager">
          <button disabled={page <= 1} onClick={() => void load(page - 1)}>← Anteriores</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => void load(page + 1)}>Próximas →</button>
        </div>
      )}

      {zoom && (
        <div className="rvZoom" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Foto ampliada" />
        </div>
      )}
    </section>
  );
}
