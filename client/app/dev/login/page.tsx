"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "../dev.css";

export default function DevLoginPage() {
  const router = useRouter();
  const [bootstrapped, setBootstrapped] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    const res = await fetch("/api/dev/auth/status", { cache: "no-store" });
    const json = await res.json();
    if (res.ok) {
      setBootstrapped(json.data.bootstrapped);
      if (json.data.loggedIn) router.push("/dev");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!bootstrapped && password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = bootstrapped ? "/api/dev/auth/login" : "/api/dev/auth/bootstrap";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.error === "INVALID_CREDENTIALS") setError("Email ou senha incorretos.");
        else if (json.error === "WEAK_PASSWORD") setError("Senha precisa ter no mínimo 8 caracteres.");
        else if (json.error === "TOO_MANY_REQUESTS") setError("Muitas tentativas — espera um pouco.");
        else setError("Erro ao entrar.");
        return;
      }

      router.push("/dev");
    } finally {
      setSubmitting(false);
    }
  }

  if (bootstrapped === null) {
    return <main className="devPage devLoginWrap"><p>Carregando...</p></main>;
  }

  return (
    <main className="devPage devLoginWrap">
      <form className="devLoginCard" onSubmit={handleSubmit}>
        <h1>{bootstrapped ? "Dashboard de devs" : "Criar o primeiro acesso de dev"}</h1>
        <p>
          {bootstrapped
            ? "Área restrita — credenciais de pagamento, saques e status da loja."
            : "Nenhum dev cadastrado ainda. Crie o primeiro acesso pra continuar."}
        </p>

        <input
          type="email"
          placeholder="email@devs.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={bootstrapped ? undefined : 8}
        />
        {!bootstrapped && (
          <input
            type="password"
            placeholder="Confirmar senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        )}

        {error && <p className="devError">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Entrando..." : bootstrapped ? "Entrar" : "Criar acesso"}
        </button>
      </form>
    </main>
  );
}
