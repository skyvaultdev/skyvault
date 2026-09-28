"use client";

import { useCallback, useEffect, useState } from "react";
import "./QuestionsPanel.css";
import { useModal } from "@/app/(components)/modal/ModalProvider";
import Icon from "@/components/icons/Icon";

type Message = { id: number; author_type: "customer" | "staff"; author_name: string | null; body: string; created_at: string };

type Q = {
  id: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  asker_name: string | null;
  question: string;
  answer: string | null;
  answered_by: string | null;
  answered_at: string | null;
  hidden: boolean;
  staff_unread: boolean;
  created_at: string;
  messages: Message[];
};

export default function QuestionsPanel() {
  const modal = useModal();
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [items, setItems] = useState<Q[]>([]);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(0);
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const pageSize = 15;

  const load = useCallback(async (targetPage: number, f: "pending" | "all") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/questions?filter=${f}&page=${targetPage}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) {
        setItems(json.data.items ?? []);
        setTotal(json.data.total ?? 0);
        setPending(json.data.pending ?? 0);
        setPage(json.data.page ?? targetPage);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1, filter);
  }, [load, filter]);

  async function send(q: Q) {
    const text = (drafts[q.id] ?? "").trim();
    if (text.length < 2) return;
    setBusyId(q.id);
    try {
      // Primeira resposta vira a "resposta" pública da pergunta; as seguintes
      // entram na conversa.
      const res = q.answer
        ? await fetch(`/api/admin/questions/${q.id}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: text }),
          })
        : await fetch(`/api/admin/questions/${q.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answer: text }),
          });
      if (!res.ok) {
        await modal.alert("Não foi possível enviar a resposta.");
        return;
      }
      setDrafts((prev) => ({ ...prev, [q.id]: "" }));
      await load(page, filter);
    } finally {
      setBusyId(null);
    }
  }

  async function patch(q: Q, body: Record<string, boolean>) {
    setBusyId(q.id);
    try {
      await fetch(`/api/admin/questions/${q.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await load(page, filter);
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Perguntas dos clientes</h3>
        <p className="helperText">
          Conversas iniciadas na página dos produtos. A primeira resposta fica pública; o cliente pode responder de volta
          e você é avisado. Use &quot;Marcar como lida&quot; para tirar o alerta sem responder.
        </p>
      </div>

      <div className="qpTabs">
        <button className={`qpTab ${filter === "pending" ? "active" : ""}`} onClick={() => setFilter("pending")}>
          Precisam de atenção {pending > 0 && <span className="qpBadge">{pending}</span>}
        </button>
        <button className={`qpTab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          Todas
        </button>
      </div>

      {loading && <p className="helperText">Carregando...</p>}
      {!loading && items.length === 0 && (
        <p className="emptyMsg">{filter === "pending" ? "Tudo em dia! Nenhuma conversa esperando você." : "Nenhuma pergunta ainda."}</p>
      )}

      <div className="qpList">
        {items.map((q) => (
          <div key={q.id} className={`qpCard ${q.hidden ? "hidden" : ""} ${q.staff_unread ? "unread" : ""}`}>
            <div className="qpHead">
              <strong>
                {q.staff_unread && <span className="qpDot" title="Não lida" />}
                {q.product_name}
              </strong>
              <a href={`/product/${q.product_slug}#perguntas`} target="_blank" rel="noopener noreferrer" className="qpLink">
                Ver na página
              </a>
            </div>

            <div className="qpThread">
              <div className="qpBubble customer">
                <span className="qpWho">{q.asker_name ?? "Cliente"}</span>
                <p>{q.question}</p>
                <span className="qpTime">{new Date(q.created_at).toLocaleString("pt-BR")}</span>
              </div>

              {q.answer && (
                <div className="qpBubble staff">
                  <span className="qpWho">{q.answered_by ?? "Loja"}</span>
                  <p>{q.answer}</p>
                  {q.answered_at && <span className="qpTime">{new Date(q.answered_at).toLocaleString("pt-BR")}</span>}
                </div>
              )}

              {q.messages.map((m) => (
                <div key={m.id} className={`qpBubble ${m.author_type}`}>
                  <span className="qpWho">{m.author_type === "staff" ? m.author_name ?? "Loja" : m.author_name ?? "Cliente"}</span>
                  <p>{m.body}</p>
                  <span className="qpTime">{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>

            <div className="qpComposer">
              <textarea
                rows={1}
                maxLength={1000}
                placeholder={q.answer ? "Continuar a conversa..." : "Escreva a resposta..."}
                value={drafts[q.id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(q);
                  }
                }}
              />
              <button className="qpSend" disabled={busyId === q.id || (drafts[q.id] ?? "").trim().length < 2} onClick={() => void send(q)} aria-label="Enviar">
                <Icon name="send" />
              </button>
            </div>

            <div className="qpActions">
              {q.staff_unread && (
                <button className="btnSecondary" disabled={busyId === q.id} onClick={() => void patch(q, { read: true })}>
                  <Icon name="check" /> Marcar como lida
                </button>
              )}
              <button className="btnSecondary" disabled={busyId === q.id} onClick={() => void patch(q, { hidden: !q.hidden })}>
                <Icon name="eye" /> {q.hidden ? "Reexibir" : "Ocultar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {total > pageSize && (
        <div className="qpPager">
          <button className="btnSecondary" disabled={page <= 1} onClick={() => void load(page - 1, filter)}>← Anterior</button>
          <span className="helperText">Página {page} de {totalPages}</span>
          <button className="btnSecondary" disabled={page >= totalPages} onClick={() => void load(page + 1, filter)}>Próxima →</button>
        </div>
      )}
    </section>
  );
}
