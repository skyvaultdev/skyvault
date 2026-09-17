"use client";

import { useEffect, useState, useCallback } from "react";
import "./ShippingCarriersPanel.css";
import { useModal } from "@/app/(components)/modal/ModalProvider";

type Carrier = {
  id: number;
  name: string;
  service_code: string | null;
  active: boolean;
  melhor_envio_service_id: number | null;
};

type MelhorEnvioStatus = {
  hasAccessToken: boolean;
  sandbox: boolean;
  configured: boolean;
};

type Props = {
  canManageCredentials: boolean;
};

export default function ShippingCarriersPanel({ canManageCredentials }: Props) {
  const modal = useModal();
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

  const [meStatus, setMeStatus] = useState<MelhorEnvioStatus | null>(null);
  const [meToken, setMeToken] = useState("");
  const [meSandbox, setMeSandbox] = useState(true);
  const [meSaving, setMeSaving] = useState(false);
  const [meFeedback, setMeFeedback] = useState("");

  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState("");

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
    if (canManageCredentials) void loadMeStatus();
  }, [load, canManageCredentials]);

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

  async function loadMeStatus() {
    const res = await fetch("/api/store/melhor-envio-credentials", { cache: "no-store" });
    const json = await res.json();
    if (res.ok) {
      setMeStatus(json.data);
      setMeSandbox(json.data.sandbox);
    }
  }

  async function saveMeCredentials(e: React.FormEvent) {
    e.preventDefault();
    setMeSaving(true);
    setMeFeedback("");
    try {
      const res = await fetch("/api/store/melhor-envio-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: meToken, sandbox: meSandbox }),
      });
      if (res.ok) {
        setMeToken("");
        setMeFeedback("Salvo!");
        await loadMeStatus();
      } else {
        setMeFeedback("Erro ao salvar.");
      }
    } finally {
      setMeSaving(false);
    }
  }

  async function syncCarriers() {
    setSyncing(true);
    setSyncFeedback("");
    try {
      const res = await fetch("/api/carriers/sync", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setSyncFeedback(`${json.data.synced} transportadora(s) sincronizada(s). Ative as que quiser usar abaixo.`);
        await load();
      } else if (json.error === "MELHOR_ENVIO_NOT_CONFIGURED") {
        setSyncFeedback("Cadastre o token do Melhor Envio antes de sincronizar.");
      } else if (json.error === "SHIPPING_ORIGIN_NOT_CONFIGURED") {
        setSyncFeedback("Cadastre o CEP de origem antes de sincronizar.");
      } else {
        setSyncFeedback("Erro ao sincronizar.");
      }
    } finally {
      setSyncing(false);
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
    if (!(await modal.confirm("Remover essa transportadora?"))) return;
    await fetch(`/api/carriers/remove/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Transportadoras</h3>
        <p className="helperText">
          Aparecem como opção de frete no checkout. Sincronize com sua conta Melhor Envio pra trazer as
          transportadoras/serviços disponíveis, ou cadastre manualmente pra usar a tabela fixa.
        </p>
      </div>

      {canManageCredentials && (
        <form className="meCredentialsForm" onSubmit={saveMeCredentials}>
          <strong>Melhor Envio · sua conta</strong>
          {meStatus && (
            <div className={`meStatusBadge ${meStatus.configured ? "ok" : "pending"}`}>
              {meStatus.configured ? "✅ Configurado" : "⚠️ Sem token cadastrado"}
            </div>
          )}
          <label>
            Token de acesso {meStatus?.hasAccessToken && <span className="meConfiguredTag">já configurado</span>}
            <input
              type="password"
              value={meToken}
              onChange={(e) => setMeToken(e.target.value)}
              placeholder={meStatus?.hasAccessToken ? "Deixe em branco pra manter o atual" : "Token da API do Melhor Envio"}
            />
          </label>
          <label className="meCheckboxRow">
            <input type="checkbox" checked={meSandbox} onChange={(e) => setMeSandbox(e.target.checked)} />
            Ambiente de testes (sandbox) — desmarque quando for cotar/enviar de verdade
          </label>
          <button type="submit" className="btn" disabled={meSaving}>
            {meSaving ? "Salvando..." : "Salvar token"}
          </button>
          {meFeedback && <p className="helperText">{meFeedback}</p>}
        </form>
      )}

      <div className="carrierAddForm">
        <button type="button" className="btnSecondary" onClick={syncCarriers} disabled={syncing}>
          {syncing ? "Sincronizando..." : "Sincronizar transportadoras (Melhor Envio)"}
        </button>
        {syncFeedback && <span className="helperText">{syncFeedback}</span>}
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
        <p className="emptyMsg">Nenhuma transportadora cadastrada — o checkout usa "Frete Padrão" até você cadastrar ou sincronizar uma.</p>
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
                {carrier.melhor_envio_service_id != null && (
                  <span className="carrierStatus">Melhor Envio</span>
                )}
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
