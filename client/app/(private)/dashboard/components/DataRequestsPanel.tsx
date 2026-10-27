"use client";

import { useEffect, useState } from "react";
import { useModal } from "@/app/(components)/modal/ModalProvider";

type DataRequest = {
  id: number;
  status: "pending" | "completed";
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
  user_id: number;
  email: string;
  username: string | null;
};

export default function DataRequestsPanel() {
  const modal = useModal();
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/data-requests", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setRequests(Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoading(false);
    }
  }

  async function act(id: number, action: "anonymize" | "dismiss") {
    if (action === "anonymize") {
      const ok = await modal.confirm(
        "Anonimizar essa conta? O e-mail e o nome do cliente serão substituídos por um placeholder, e o endereço/perfil salvo serão apagados. Os pedidos continuam no histórico, sem dado pessoal além do pedido em si. Essa ação não pode ser desfeita.",
        { danger: true }
      );
      if (!ok) return;
    }

    setBusyId(id);
    setFeedback("");
    try {
      const res = await fetch(`/api/admin/data-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setFeedback(action === "anonymize" ? "Conta anonimizada." : "Solicitação arquivada.");
        await load();
      } else {
        setFeedback("Não foi possível processar a solicitação.");
      }
    } finally {
      setBusyId(null);
    }
  }

  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status === "completed");

  if (loading) return <section className="settingsPanel"><p>Carregando...</p></section>;

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Solicitações de exclusão de dados (LGPD)</h3>
        <p className="helperText">
          Clientes pedem exclusão pelo próprio perfil. Anonimizar apaga o perfil/endereço salvos e troca
          e-mail/nome por um placeholder — os pedidos continuam no histórico pra contabilidade, só sem dado pessoal
          extra.
        </p>
      </div>

      {feedback && <p className="helperText">{feedback}</p>}

      <div className="generalSection">
        <h4>Pendentes ({pending.length})</h4>
        {pending.length === 0 && <p className="emptyMsg">Nenhuma solicitação pendente.</p>}
        {pending.map((r) => (
          <div key={r.id} className="tierRow">
            <span>{r.email} — pedido em {new Date(r.requested_at).toLocaleString("pt-BR")}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" disabled={busyId === r.id} onClick={() => void act(r.id, "anonymize")}>
                Anonimizar
              </button>
              <button className="btnSecondary" disabled={busyId === r.id} onClick={() => void act(r.id, "dismiss")}>
                Arquivar sem anonimizar
              </button>
            </div>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <div className="generalSection">
          <h4>Processadas</h4>
          {done.map((r) => (
            <p key={r.id} className="helperText">
              {r.email} — processado por {r.processed_by ?? "?"} em{" "}
              {r.processed_at ? new Date(r.processed_at).toLocaleString("pt-BR") : "?"}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
