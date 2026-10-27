"use client";

import { useEffect, useState } from "react";
import "./cookieConsent.css";

const STORAGE_KEY = "cookie-consent-v1";

// Aviso de cookies exigido pela LGPD — a loja usa cookies essenciais
// (sessão/carrinho) sempre, então não há nada pra "bloquear" até o
// aceite; isso é só o aviso/registro de que o visitante foi informado.
// localStorage (não cookie nem banco) de propósito: é uma conveniência
// por navegador, não precisa ser lida pelo servidor nem persistir entre
// dispositivos.
export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage bloqueado (modo privado, etc.) — não mostra o
      // banner em vez de quebrar a página.
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignora — pior caso é o banner aparecer de novo na próxima visita
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="cookieConsentBanner" role="dialog" aria-label="Aviso de cookies">
      <p>
        Usamos cookies essenciais para o funcionamento da loja (login, carrinho, segurança). Ao continuar navegando,
        você concorda com isso — veja a{" "}
        <a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.
      </p>
      <button type="button" className="cookieConsentBtn" onClick={accept}>
        Entendi
      </button>
    </div>
  );
}
