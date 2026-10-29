"use client";

import { useEffect, useState } from "react";
import PlatformTermsContent from "@/app/(public)/termos-plataforma/PlatformTermsContent";
import "@/app/(public)/_legal/legalDocument.css";
import "./AcceptPlatformTermsGate.css";

type TermsStatus = { needsAcceptance: boolean; termsVersion: string; platformName: string; platformContactEmail: string };

// No primeiro acesso do OWNER ao dashboard (ou sempre que a versão do
// contrato muda — ver PLATFORM_TERMS_VERSION), bloqueia o resto do
// dashboard até ele marcar "Li e aceito". Admin/editor nunca veem esse
// gate (GET /api/dashboard/terms só retorna needsAcceptance=true pro
// owner).
export default function AcceptPlatformTermsGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<TermsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/dashboard/terms", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) setStatus(json.data);
    } finally {
      setLoading(false);
    }
  }

  async function accept() {
    setAccepting(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard/terms", { method: "POST" });
      if (res.ok) {
        setStatus((prev) => (prev ? { ...prev, needsAcceptance: false } : prev));
      } else {
        setError("Não foi possível registrar o aceite. Tente novamente.");
      }
    } finally {
      setAccepting(false);
    }
  }

  // Enquanto não sabemos se precisa aceitar, não mostra nada — evita um
  // flash do dashboard inteiro antes do gate aparecer.
  if (loading) return null;
  if (!status?.needsAcceptance) return <>{children}</>;

  return (
    <div className="platformTermsGate">
      <div className="platformTermsGateCard">
        <h2 className="platformTermsGateTitle">Antes de continuar</h2>
        <p className="helperText">
          Pra usar o dashboard, você (como owner da loja) precisa ler e aceitar os Termos e Condições da Plataforma.
        </p>

        <div className="platformTermsGateScroll termos-container">
          <PlatformTermsContent platformName={status.platformName} platformContactEmail={status.platformContactEmail} />
        </div>

        <p className="platformTermsGateFiscalNotice">
          Ao aceitar, você confirma que é o único responsável pela emissão de notas fiscais (NF-e/NFS-e) das suas
          vendas e pelo recolhimento dos tributos correspondentes — a {status.platformName} não participa do
          pagamento nem emite documentos fiscais em seu nome (cláusula 5.3).
        </p>

        <label className="legalCheckboxRow">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          Li e aceito os Termos e Condições da Plataforma acima.
        </label>

        {error && <p className="legalFieldError">{error}</p>}

        <button type="button" className="btn" onClick={() => void accept()} disabled={!checked || accepting}>
          {accepting ? "Registrando..." : "Aceitar e continuar"}
        </button>
      </div>
    </div>
  );
}
