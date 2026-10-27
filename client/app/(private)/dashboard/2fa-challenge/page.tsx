"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./challenge.css";

// Página independente (não usa o layout pesado do dashboard) — só pede o
// código do app autenticador antes de liberar o resto. middlewares/auth.middleware.ts
// redireciona pra cá sempre que a conta tem 2FA ligado e a sessão ainda
// não confirmou o código.
export default function TwoFaChallengePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError("Código inválido. Confira o app autenticador e tente de novo.");
      }
    } catch {
      setError("Erro de rede. Tente de novo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="twoFaChallengePage">
      <div className="twoFaChallengeCard">
        <h1>Confirme seu acesso</h1>
        <p className="twoFaChallengeHint">
          Essa conta tem verificação em duas etapas ativada. Digite o código de 6 dígitos do seu app autenticador.
        </p>
        <input
          className="twoFaChallengeInput"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          autoFocus
        />
        {error && <p className="twoFaChallengeError">{error}</p>}
        <button className="btn" onClick={() => void submit()} disabled={submitting || code.length !== 6}>
          {submitting ? "Verificando..." : "Confirmar"}
        </button>
      </div>
    </main>
  );
}
