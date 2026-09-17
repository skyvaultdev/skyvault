"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import "./dev.css";

type Tab = "mercadopago" | "melhorenvio" | "loja";

type MercadoPagoStatus = {
  configured: boolean;
  sandbox: boolean;
  source: "env";
};

type MelhorEnvioStatus = {
  configured: boolean;
  sandbox: boolean;
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
  const [tab, setTab] = useState<Tab>("mercadopago");

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
          <button className={tab === "mercadopago" ? "active" : ""} onClick={() => setTab("mercadopago")}>Mercado Pago</button>
          <button className={tab === "melhorenvio" ? "active" : ""} onClick={() => setTab("melhorenvio")}>Melhor Envio</button>
          <button className={tab === "loja" ? "active" : ""} onClick={() => setTab("loja")}>Loja &amp; equipe</button>
        </nav>

        {tab === "mercadopago" && <MercadoPagoSection />}
        {tab === "melhorenvio" && <MelhorEnvioSection />}
        {tab === "loja" && <StoreSection />}
      </div>
    </main>
  );
}

// Somente leitura de propósito — quem configura a credencial é o dono da
// loja, direto no .env do servidor (MERCADO_PAGO_ACCESS_TOKEN/PUBLIC_KEY,
// é a conta dele que recebe o dinheiro), os devs só conferem se está tudo
// certo.
function MercadoPagoSection() {
  const [status, setStatus] = useState<MercadoPagoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dev/mercadopago-status", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setStatus(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleTestConnection() {
    setTesting(true);
    setTestResult("");
    try {
      const res = await fetch("/api/dev/mercadopago-status/test", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setTestResult(`✅ Conectado — conta: ${json.data.accountEmail}`);
      } else if (json.error === "NOT_CONFIGURED") {
        setTestResult("⚠️ A loja ainda não configurou as credenciais.");
      } else {
        setTestResult(`❌ Falha na conexão (${json.error}).`);
      }
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <section className="devSection"><p>Carregando...</p></section>;

  return (
    <section className="devSection">
      <h2>Mercado Pago da loja</h2>
      <p className="devHelperText">
        Credencial configurada pelo dono da loja no .env do servidor (MERCADO_PAGO_ACCESS_TOKEN /
        MERCADO_PAGO_PUBLIC_KEY) — o dinheiro das vendas cai direto na conta dele, não passa pelos
        devs. Aqui só dá pra conferir se está configurado e funcionando.
      </p>

      {status && (
        <span className={`devStatusBadge ${status.configured ? "ok" : "pending"}`}>
          {status.configured ? "✅ Configurado" : "⚠️ .env sem credenciais do Mercado Pago"}
        </span>
      )}

      {status?.configured && (
        <p className="devHelperText">
          Ambiente: {status.sandbox ? "sandbox (testes)" : "produção"}
        </p>
      )}

      <button className="devBtnSecondary" onClick={handleTestConnection} disabled={!status?.configured || testing}>
        {testing ? "Testando..." : "Testar conexão"}
      </button>
      {testResult && <p className="devHelperText">{testResult}</p>}
    </section>
  );
}

// Somente leitura: mostra o retorno bruto da API do Melhor Envio (conta +
// transportadoras/serviços disponíveis) usando o token que o dono salvou na
// aba Transportadoras — os devs nunca veem o token, só o que a API do
// Melhor Envio devolve com ele.
function MelhorEnvioSection() {
  const [status, setStatus] = useState<MelhorEnvioStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingRaw, setFetchingRaw] = useState(false);
  const [rawData, setRawData] = useState<unknown>(null);
  const [rawError, setRawError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dev/melhor-envio-status", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setStatus(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleFetchRaw() {
    setFetchingRaw(true);
    setRawError("");
    setRawData(null);
    try {
      const res = await fetch("/api/dev/melhor-envio-status/raw", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setRawData(json.data);
      } else {
        setRawError(`❌ Falha ao buscar dados (${json.error}).`);
      }
    } finally {
      setFetchingRaw(false);
    }
  }

  if (loading) return <section className="devSection"><p>Carregando...</p></section>;

  return (
    <section className="devSection">
      <h2>Melhor Envio da loja</h2>
      <p className="devHelperText">
        Token configurado pelo dono da loja na aba Transportadoras (criptografado no banco). Aqui dá
        pra conferir se está configurado e puxar os dados brutos que a API do Melhor Envio devolve
        pra essa conta (dados da conta + transportadoras/serviços disponíveis) — sem nunca expor o
        token.
      </p>

      {status && (
        <span className={`devStatusBadge ${status.configured ? "ok" : "pending"}`}>
          {status.configured ? "✅ Configurado" : "⚠️ Loja ainda não configurou"}
        </span>
      )}

      {status?.configured && (
        <p className="devHelperText">Ambiente: {status.sandbox ? "sandbox (testes)" : "produção"}</p>
      )}

      <button className="devBtnSecondary" onClick={handleFetchRaw} disabled={!status?.configured || fetchingRaw}>
        {fetchingRaw ? "Buscando..." : "Ver dados brutos da API"}
      </button>
      {rawError && <p className="devHelperText">{rawError}</p>}
      {(rawData !== null && rawData !== undefined) ? <pre className="devRawJson">{JSON.stringify(rawData, null, 2)}</pre> : null}
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
          Suspender bloqueia o acesso à dashboard de TODO o time da loja (owner incluso) e desativa
          checkout/compras no site — útil pra mensalidade em atraso, por exemplo.
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
