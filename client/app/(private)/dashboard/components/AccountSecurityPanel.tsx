"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import "./AccountSecurityPanel.css";

// Qualquer staff com dashboard.access pode ligar/desligar 2FA pra PRÓPRIA
// conta (não depende de team.manage — ver app/api/auth/2fa/setup/route.ts).
export default function AccountSecurityPanel() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [pendingSecret, setPendingSecret] = useState("");
  const [pendingUri, setPendingUri] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setEnabled(!!json.data.enabled);
        setPendingSecret(json.data.secret ?? "");
        setPendingUri(json.data.uri ?? "");
      }
    } finally {
      setLoading(false);
    }
  }

  async function confirmSetup() {
    setSubmitting(true);
    setError("");
    setFeedback("");
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (json.ok) {
        setEnabled(true);
        setCode("");
        setFeedback("Verificação em duas etapas ativada.");
      } else {
        setError("Código inválido. Confira o app autenticador e tente de novo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function disable() {
    setSubmitting(true);
    setError("");
    setFeedback("");
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (json.ok) {
        setEnabled(false);
        setCode("");
        setFeedback("Verificação em duas etapas desativada.");
        void load();
      } else {
        setError("Código inválido. Confira o app autenticador e tente de novo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <section className="settingsPanel"><p>Carregando...</p></section>;

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Segurança da conta</h3>
        <p className="helperText">
          Verificação em duas etapas (2FA) pede, além da senha, um código de 6 dígitos gerado por um app
          autenticador (Google Authenticator, Authy, etc) a cada novo login no painel.
        </p>
      </div>

      <div className="securitySection">
        <span className={`securityStatusBadge ${enabled ? "on" : "off"}`}>
          {enabled ? "2FA ativada" : "2FA desativada"}
        </span>

        {!enabled && (
          <>
            <h4>Ativar 2FA</h4>
            <p className="helperText">Escaneie o QR Code com o app autenticador ou digite o código manualmente.</p>
            <div className="securityQrBox">
              {pendingUri && <QRCodeSVG value={pendingUri} size={160} />}
              {pendingSecret && (
                <span className="securitySecretText">
                  Código manual:<br />{pendingSecret}
                </span>
              )}
            </div>
            <label>
              Código de 6 dígitos
              <input
                className="settingsInput securityCodeInput"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            {error && <p className="securityFieldError">{error}</p>}
            <button className="btn" onClick={() => void confirmSetup()} disabled={submitting || code.length !== 6}>
              {submitting ? "Confirmando..." : "Confirmar e ativar"}
            </button>
          </>
        )}

        {enabled && (
          <>
            <h4>Desativar 2FA</h4>
            <p className="helperText">Digite um código atual do app autenticador para confirmar a desativação.</p>
            <label>
              Código de 6 dígitos
              <input
                className="settingsInput securityCodeInput"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            {error && <p className="securityFieldError">{error}</p>}
            <button className="btnSecondary" onClick={() => void disable()} disabled={submitting || code.length !== 6}>
              {submitting ? "Desativando..." : "Desativar 2FA"}
            </button>
          </>
        )}

        {feedback && <p className="helperText">{feedback}</p>}
      </div>
    </section>
  );
}
