"use client";

import { useEffect, useState, useCallback } from "react";
import "./ShippingCarriersPanel.css";

type Carrier = {
  id: number;
  name: string;
  service_code: string | null;
  active: boolean;
};

export default function ShippingCarriersPanel() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [newServiceCode, setNewServiceCode] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editServiceCode, setEditServiceCode] = useState("");

  const [originCep, setOriginCep] = useState("");
  const [savingOriginCep, setSavingOriginCep] = useState(false);
  const [originCepFeedback, setOriginCepFeedback] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/carriers", { cache: "no-store" });
      const json = await res.json();
      setCarriers(res.ok && Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadOriginCep();
  }, [load]);

  async function loadOriginCep() {
    const res = await fetch("/api/admin/shipping-settings", { cache: "no-store" });
    const json = await res.json();
    if (res.ok && json.data?.origin_cep) setOriginCep(json.data.origin_cep);
  }

  async function saveOriginCep(e: React.FormEvent) {
    e.preventDefault();
    setSavingOriginCep(true);
    setOriginCepFeedback("");
    try {
      const res = await fetch("/api/admin/shipping-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originCep }),
      });
      setOriginCepFeedback(res.ok ? "Salvo!" : "CEP inválido.");
    } finally {
      setSavingOriginCep(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);

    try {
      await fetch("/api/carriers/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, serviceCode: newServiceCode }),
      });
      setNewName("");
      setNewServiceCode("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  function startEdit(carrier: Carrier) {
    setEditingId(carrier.id);
    setEditName(carrier.name);
    setEditServiceCode(carrier.service_code ?? "");
  }

  async function saveEdit(id: number) {
    await fetch(`/api/carriers/edit/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, serviceCode: editServiceCode }),
    });
    setEditingId(null);
    await load();
  }

  async function toggleActive(carrier: Carrier) {
    await fetch(`/api/carriers/edit/${carrier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !carrier.active }),
    });
    await load();
  }

  async function removeCarrier(id: number) {
    if (!confirm("Remover essa transportadora?")) return;
    await fetch(`/api/carriers/remove/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Transportadoras</h3>
        <p className="helperText">
          Aparecem como opção de frete no checkout (cotação por tabela fixa configurável, por enquanto).
        </p>
      </div>

      <form className="carrierAddForm originCepForm" onSubmit={saveOriginCep}>
        <input
          placeholder="CEP de origem (de onde os pacotes saem)"
          value={originCep}
          onChange={(e) => setOriginCep(e.target.value.replace(/[^\d-]/g, ""))}
          maxLength={9}
        />
        <button type="submit" className="btnSecondary" disabled={savingOriginCep}>
          {savingOriginCep ? "Salvando..." : "Salvar CEP de origem"}
        </button>
        {originCepFeedback && <span className="helperText">{originCepFeedback}</span>}
      </form>

      <form className="carrierAddForm" onSubmit={handleCreate}>
        <input placeholder="Nome (ex: Correios PAC)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input placeholder="Código do serviço (opcional)" value={newServiceCode} onChange={(e) => setNewServiceCode(e.target.value)} />
        <button type="submit" className="btn" disabled={creating}>Adicionar</button>
      </form>

      {loading && <p>Carregando...</p>}
      {!loading && carriers.length === 0 && (
        <p className="emptyMsg">Nenhuma transportadora cadastrada — o checkout usa "Frete Padrão" até você cadastrar uma.</p>
      )}

      <div className="carrierList">
        {carriers.map((carrier) => (
          <div key={carrier.id} className={`carrierRow ${!carrier.active ? "inactive" : ""}`}>
            {editingId === carrier.id ? (
              <>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                <input value={editServiceCode} onChange={(e) => setEditServiceCode(e.target.value)} />
                <button className="btn" onClick={() => saveEdit(carrier.id)}>Salvar</button>
                <button className="btnSecondary" onClick={() => setEditingId(null)}>Cancelar</button>
              </>
            ) : (
              <>
                <span className="carrierName">{carrier.name}</span>
                <span className="helperText">{carrier.service_code || "—"}</span>
                <span className={`carrierStatus ${carrier.active ? "active" : ""}`}>
                  {carrier.active ? "Ativa" : "Inativa"}
                </span>
                <div className="carrierActions">
                  <button className="btnEditSmall" onClick={() => toggleActive(carrier)}>
                    {carrier.active ? "Desativar" : "Ativar"}
                  </button>
                  <button className="btnEditSmall" onClick={() => startEdit(carrier)}>Editar</button>
                  <button className="btnEditSmall" onClick={() => removeCarrier(carrier.id)}>Remover</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
