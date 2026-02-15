"use client";

import "./login.css";
import "./modal.css";
import { FaDiscord } from "react-icons/fa";
import { useState, useEffect } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [code, setCode] = useState("");

  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setIsSending(true);
    setMsg("Enviando email...");

    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setMsg("Código enviado para seu email");
        setCode("");
        setIsModalOpen(true);
        setCooldown(60);
      } else {
        setMsg(data.error || "Erro ao enviar email");
      }
    } catch {
      setMsg("Erro de rede. Tente novamente.");
    } finally {
      setIsSending(false);
    }
  }

  function closeModal() {
    setIsModalOpen(false);
    setCode("");
  }

  async function resendEmail() {
    if (cooldown > 0) return;

    setIsSending(true);
    setMsg("Enviando email...");

    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setMsg("Código reenviado para seu email");
        setCode("");
        setCooldown(60);
      } else {
        setMsg(data.error || "Erro ao enviar email");
      }
    } catch {
      setMsg("Erro de rede. Tente novamente.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleVerifyCode() {
    if (!code.trim()) {
      setMsg("Digite o código.");
      return;
    }

    setIsVerifying(true);
    setMsg("Verificando código...");

    try {
      const res = await fetch("/api/auth/email/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const data = await res.json();

      if (res.ok) {
        setMsg("Código verificado! Login autorizado.");
        setIsModalOpen(false);
        window.location.href = "/";
      } else {
        setMsg(data.error || "Código inválido.");
      }
    } catch {
      setMsg("Erro de rede ao verificar. Tente novamente.");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="loginpage">
      <div className="logincontainer">
        <h1>Login</h1>

        <form onSubmit={handleSubmit}>
          <div className="loginitems">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="butao">
            <button type="submit" disabled={isSending}>
              {isSending ? "Enviando..." : "Continuar"}
            </button>
          </div>
        </form>

        <p>OU</p>

        <div className="discord">
          <button
            type="button"
            onClick={() => (window.location.href = "/api/auth/discord")}
          >
            <FaDiscord className="discord-icon" /> Entrar com Discord
          </button>
        </div>

        {msg && <p>{msg}</p>}
      </div>

      {isModalOpen && (
        <div className="modalOverlay" onClick={closeModal}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <h2>Digite o código</h2>

            <p>
              Enviamos um código para: <b>{email}</b>
            </p>

            <input
              type="text"
              placeholder="Código"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              autoFocus
              className="modalCodeInput"
            />

            <div className="modalActions">
              <button
                type="button"
                onClick={closeModal}
                className="modalCancel"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={resendEmail}
                disabled={cooldown > 0 || isSending}
                className="modalResend"
              >
                {cooldown > 0
                  ? `Reenviar em ${cooldown}s`
                  : "Reenviar Email"}
              </button>

              <button
                type="button"
                onClick={handleVerifyCode}
                disabled={isVerifying}
                className="modalConfirm"
              >
                {isVerifying ? "Verificando..." : "Verificar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
