"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import "./dev.css";

type Tab = "efibank" | "saques" | "loja";

type CredentialsStatus = {
  clientId: string;
  hasClientSecret: boolean;
  hasCert: boolean;
  certFilename: string | null;
  hasCertPassword: boolean;
  pixKey: string;
  sandbox: boolean;
  webhookRegisteredAt: string | null;
  configured: boolean;
};

type WithdrawalRequest = {
  id: number;
  amount: number;
  payout_method: string | null;
  payout_details: string | null;
  status: string;
  requested_at: string;
  requested_by_email: string | null;
  processed_by_email: string | null;
};

type AdminRow = {
  id: number;
  email: string;
  role: string;
  blocked: boolean;
};

type StoreStatus = {
  store_name: string | null;
  suspended: boolean;
  suspended_reason: string | null;
};

export default function DevDashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("efibank");

  return (
    <main className="devPage">
      <header className="devHeader">
        <h1>🛠 Dashboard de devs</h1>
        <button
          onClick={async () => {
            await fetch("/api/dev/auth/logout", { method: "POST" });
            router.push("/dev/login");
          }}
        >
          Sair
        </button>
      </header>

      <div className="devContent">
        <nav className="devTabs">
          <button className={tab === "efibank" ? "active" : ""} onClick={() => setTab("efibank")}>EfiBank</button>
          <button className={tab === "saques" ? "active" : ""} onClick={() => setTab("saques")}>Saques</button>
          <button className={tab === "loja" ? "active" : ""} onClick={() => setTab("loja")}>Loja &amp; equipe</button>
        </nav>

        {tab === "efibank" && <EfibankSection />}
        {tab === "saques" && <WithdrawalsSection />}
        {tab === "loja" && <StoreSection />}
      </div>
    </main>
  );
}

function EfibankSection() {
  const [status, setStatus] = useState<CredentialsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [feedback, setFeedback] = useState("");

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [certPassword, setCertPassword] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [sandbox, setSandbox] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dev/efibank-credentials", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setStatus(json.data);
        setClientId(json.data.clientId);
        setPixKey(json.data.pixKey);
        setSandbox(json.data.sandbox);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback("");
    try {
      const form = new FormData();
      form.append("clientId", clientId);
      form.append("pixKey", pixKey);
      form.append("sandbox", String(sandbox));
      if (clientSecret) form.append("clientSecret", clientSecret);
      if (certPassword) form.append("certPassword", certPassword);
      if (fileRef.current?.files?.[0]) form.append("cert", fileRef.current.files[0]);

      const res = await fetch("/api/dev/efibank-credentials", { method: "POST", body: form });
      if (res.ok) {
        setClientSecret("");
        setCertPassword("");
        if (fileRef.current) fileRef.current.value = "";
        setFeedback("Salvo!");
        await load();
      } else {
        setFeedback("Erro ao salvar.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRegisterWebhook() {
    setRegistering(true);
    setFeedback("");
    try {
      const res = await fetch("/api/dev/efibank-credentials/register-webhook", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setFeedback(`Webhook registrado: ${json.data.webhookUrl}`);
        await load();
      } else if (json.error === "WEBHOOK_URL_NOT_PUBLIC") {
        setFeedback("WEBSITE_URL precisa ser público (não localhost) pra registrar webhook.");
      } else {
        setFeedback("Erro ao registrar webhook.");
      }
    } finally {
      setRegistering(false);
    }
  }

  if (loading) return <section className="devSection"><p>Carregando...</p></section>;

  return (
    <section className="devSection">
      <h2>Credenciais EfiBank (conta dos devs)</h2>
      <p className="devHelperText">
        Todo Pix da loja cai aqui — o saldo de cada venda é repassado ao dono da loja via saldo interno,
        não pela EfiBank diretamente.
      </p>

      {status && (
        <span className={`devStatusBadge ${status.configured ? "ok" : "pending"}`}>
          {status.configured ? "✅ Configurado" : "⚠️ Incompleto"}
        </span>
      )}

      <form className="devForm" onSubmit={handleSubmit}>
        <label>
          Client ID
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </label>
        <label>
          Client Secret {status?.hasClientSecret && <span className="devTag">já configurado</span>}
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={status?.hasClientSecret ? "Deixe em branco pra manter" : ""}
          />
        </label>
        <label>
          Certificado (.p12) {status?.hasCert && <span className="devTag">{status.certFilename}</span>}
          <input ref={fileRef} type="file" accept=".p12,.pfx" />
        </label>
        <label>
          Senha do certificado {status?.hasCertPassword && <span className="devTag">já configurada</span>}
          <input
            type="password"
            value={certPassword}
            onChange={(e) => setCertPassword(e.target.value)}
            placeholder={status?.hasCertPassword ? "Deixe em branco pra manter" : ""}
          />
        </label>
        <label>
          Chave Pix
          <input value={pixKey} onChange={(e) => setPixKey(e.target.value)} />
        </label>
        <label className="devCheckboxRow">
          <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
          Ambiente de testes (sandbox)
        </label>
        <button type="submit" className="devBtn" disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </form>

      <div>
        <h3>Webhook</h3>
        {status?.webhookRegisteredAt && (
          <p className="devHelperText">Registrado em {new Date(status.webhookRegisteredAt).toLocaleString("pt-BR")}</p>
        )}
        <button className="devBtnSecondary" onClick={handleRegisterWebhook} disabled={!status?.configured || registering}>
          {registering ? "Registrando..." : "Registrar webhook"}
        </button>
      </div>

      {feedback && <p className="devHelperText">{feedback}</p>}
    </section>
  );
}

const WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  paid: "Pago",
  rejected: "Rejeitado",
};

function WithdrawalsSection() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dev/withdrawals", { cache: "no-store" });
      const json = await res.json();
      setWithdrawals(res.ok ? json.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(id: number, status: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/dev/withdrawals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error === "INSUFFICIENT_BALANCE" ? "Saldo insuficiente pra pagar esse resgate." : "Erro ao atualizar.");
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="devSection">
      <h2>Saques solicitados pela loja</h2>
      <p className="devHelperText">Aprovar libera pra pagamento; "Marcar como pago" debita o saldo interno de verdade.</p>

      {loading && <p>Carregando...</p>}
      {!loading && withdrawals.length === 0 && <p className="devHelperText">Nenhum resgate solicitado.</p>}

      <div className="devList">
        {withdrawals.map((w) => (
          <div key={w.id} className="devRow">
            <div className="devRowMain">
              <strong>
                R$ {Number(w.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                {" · "}{WITHDRAWAL_STATUS_LABELS[w.status] ?? w.status}
              </strong>
              <span>
                {w.payout_method} {w.payout_details ? `— ${w.payout_details}` : ""} · pedido por {w.requested_by_email}
              </span>
            </div>
            {w.status === "pending" && (
              <>
                <button className="devBtn" disabled={busyId === w.id} onClick={() => updateStatus(w.id, "approved")}>Aprovar</button>
                <button className="devBtnDanger" disabled={busyId === w.id} onClick={() => updateStatus(w.id, "rejected")}>Rejeitar</button>
              </>
            )}
            {w.status === "approved" && (
              <button className="devBtn" disabled={busyId === w.id} onClick={() => updateStatus(w.id, "paid")}>Marcar como pago</button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function StoreSection() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [suspendReason, setSuspendReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [adminsRes, storeRes] = await Promise.all([
        fetch("/api/dev/admins", { cache: "no-store" }),
        fetch("/api/dev/store-status", { cache: "no-store" }),
      ]);
      const adminsJson = await adminsRes.json();
      const storeJson = await storeRes.json();
      if (adminsRes.ok) setAdmins(adminsJson.data);
      if (storeRes.ok) {
        setStoreStatus(storeJson.data);
        setSuspendReason(storeJson.data.suspended_reason || "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleAdminBlocked(admin: AdminRow) {
    setBusy(true);
    try {
      await fetch(`/api/dev/admins/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: !admin.blocked }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleStoreSuspended() {
    if (!storeStatus) return;
    setBusy(true);
    try {
      await fetch("/api/dev/store-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: !storeStatus.suspended, reason: suspendReason }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="devSection"><p>Carregando...</p></section>;

  return (
    <>
      <section className="devSection">
        <h2>{storeStatus?.store_name || "Loja"}</h2>
        <span className={`devStatusBadge ${storeStatus?.suspended ? "danger" : "ok"}`}>
          {storeStatus?.suspended ? "🚫 Suspensa" : "✅ Ativa"}
        </span>
        <p className="devHelperText">
          Suspender bloqueia o acesso à dashboard de TODO o time da loja (owner incluso) até você reativar —
          útil pra mensalidade em atraso, por exemplo.
        </p>
        <label className="devSuspendReasonLabel">
          Motivo (opcional, fica salvo pra referência)
          <input value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
        </label>
        <button
          className={storeStatus?.suspended ? "devBtn" : "devBtnDanger"}
          onClick={toggleStoreSuspended}
          disabled={busy}
        >
          {storeStatus?.suspended ? "Reativar loja" : "Suspender loja"}
        </button>
      </section>

      <section className="devSection">
        <h2>Donos e equipe</h2>
        <p className="devHelperText">
          Bloquear aqui revoga o acesso individual imediatamente, sem mexer no resto da loja.
        </p>
        <div className="devList">
          {admins.map((admin) => (
            <div key={admin.id} className="devRow">
              <div className="devRowMain">
                <strong>{admin.email}</strong>
                <span>{admin.role}{admin.blocked ? " · bloqueado" : ""}</span>
              </div>
              <button
                className={admin.blocked ? "devBtn" : "devBtnDanger"}
                disabled={busy}
                onClick={() => toggleAdminBlocked(admin)}
              >
                {admin.blocked ? "Desbloquear" : "Bloquear"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
