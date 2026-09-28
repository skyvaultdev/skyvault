"use client";

import { useCallback, useEffect, useState } from "react";
import { useModal } from "@/app/(components)/modal/ModalProvider";
import Icon from "@/components/icons/Icon";
import "./questions.css";

type Message = { id: number; author_type: "customer" | "staff"; author_name: string | null; body: string; created_at: string };

type Question = {
  id: number;
  asker_name: string | null;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
  mine: boolean;
  messages: Message[];
};

// Perguntas e respostas públicas do produto, estilo Mercado Livre. Depois que
// a loja responde, quem perguntou pode continuar a conversa.
export default function ProductQuestions({ productId }: { productId: number }) {
  const modal = useModal();
  const [items, setItems] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [draft, setDraft] = useState("");
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [sending, setSending] = useState(false);
  const [replyBusy, setReplyBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/products/${productId}/questions?page=${targetPage}`, { cache: "no-store" });
        const json = await res.json();
        if (res.ok && json.data) {
          setItems(json.data.items ?? []);
          setTotal(json.data.total ?? 0);
          setPage(json.data.page ?? targetPage);
          setPageSize(json.data.pageSize ?? 5);
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

  async function submit() {
    const text = draft.trim();
    if (text.length < 5) {
      await modal.alert("Escreva uma pergunta com pelo menos 5 caracteres.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/products/${productId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      if (res.status === 401 || res.status === 404) {
        await modal.alert("Entre na sua conta para fazer uma pergunta.");
        return;
      }
      if (res.status === 429) {
        await modal.alert("Você fez muitas perguntas seguidas. Aguarde alguns minutos.");
        return;
      }
      if (!res.ok) {
        await modal.alert("Não foi possível enviar sua pergunta. Tente novamente.");
        return;
      }
      setDraft("");
      await modal.alert("Pergunta enviada! Você será avisado quando a loja responder.");
      await load(1);
    } finally {
      setSending(false);
    }
  }

  async function sendReply(q: Question) {
    const text = (replies[q.id] ?? "").trim();
    if (text.length < 2) return;
    setReplyBusy(q.id);
    try {
      const res = await fetch(`/api/products/${productId}/questions/${q.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (res.status === 429) {
        await modal.alert("Muitas mensagens seguidas. Aguarde alguns minutos.");
        return;
      }
      if (!res.ok) {
        await modal.alert("Não foi possível enviar sua mensagem. Tente novamente.");
        return;
      }
      setReplies((prev) => ({ ...prev, [q.id]: "" }));
      await load(page);
    } finally {
      setReplyBusy(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="qaSection" id="perguntas">
      <h2 className="qaTitle">Perguntas e respostas</h2>

      <div className="qaAsk">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva sua pergunta ao vendedor..."
          maxLength={500}
          rows={2}
        />
        <button onClick={() => void submit()} disabled={sending || draft.trim().length < 5}>
          {sending ? "Enviando..." : "Perguntar"}
        </button>
      </div>

      {loading && <p className="qaEmpty">Carregando...</p>}
      {!loading && items.length === 0 && <p className="qaEmpty">Ainda não há perguntas. Seja o primeiro a perguntar!</p>}

      <div className="qaList">
        {items.map((q) => (
          <article key={q.id} className="qaItem">
            <p className="qaQuestion">
              <span className="qaIcon"><Icon name="chat" /></span>
              {q.question}
            </p>
            <p className="qaMeta">
              {q.asker_name ?? "Cliente"} · {new Date(q.created_at).toLocaleDateString("pt-BR")}
            </p>

            {q.answer ? (
              <div className="qaThread">
                <div className="qaBubble staff">
                  <span className="qaWho">Loja</span>
                  <p>{q.answer}</p>
                  {q.answered_at && <span className="qaMeta">{new Date(q.answered_at).toLocaleString("pt-BR")}</span>}
                </div>
                {q.messages.map((m) => (
                  <div key={m.id} className={`qaBubble ${m.author_type}`}>
                    <span className="qaWho">{m.author_type === "staff" ? "Loja" : m.author_name ?? "Cliente"}</span>
                    <p>{m.body}</p>
                    <span className="qaMeta">{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                ))}
                {q.mine && (
                  <div className="qaReply">
                    <input
                      type="text"
                      maxLength={500}
                      placeholder="Responder à loja..."
                      value={replies[q.id] ?? ""}
                      onChange={(e) => setReplies((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") void sendReply(q); }}
                    />
                    <button onClick={() => void sendReply(q)} disabled={replyBusy === q.id || (replies[q.id] ?? "").trim().length < 2} aria-label="Enviar resposta">
                      <Icon name="send" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="qaPending">Aguardando resposta da loja.</p>
            )}
          </article>
        ))}
      </div>

      {total > pageSize && (
        <div className="qaPager">
          <button disabled={page <= 1} onClick={() => void load(page - 1)}>← Anteriores</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => void load(page + 1)}>Próximas →</button>
        </div>
      )}
    </section>
  );
}
