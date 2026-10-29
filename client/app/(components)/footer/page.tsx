"use client";

import Link from "next/link";
import "./footer.css";
import { formatDocument } from "@/lib/legal/documentValidation";

type Props = {
  storeName: string;
  isLoggedIn: boolean;
  legalName: string | null;
  document: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  platformName: string;
};

export default function Footer({
  storeName,
  isLoggedIn,
  legalName,
  document: legalDocument,
  address,
  contactEmail,
  contactPhone,
  platformName,
}: Props) {
  function openChat() {
    window.dispatchEvent(new Event("abrirChat"));
  }

  const hasLegalInfo = !!(legalName || legalDocument || address || contactEmail || contactPhone);

  return (
    <footer className="footer">
      <div className="infocontainer">
        <div className="footerColumns">
          <div className="footerColumn">
            <h4>Loja</h4>
            <Link href="/catalog">Catálogo completo</Link>
                 <span className="footerspan"></span>
            <Link href="/home">Início</Link>
          </div>

          <div className="footerColumn">
            <h4>Conta</h4>
            {isLoggedIn ? (
              <>
                <Link href="/profile">Meu perfil</Link>

                <Link href="/orders">Meus pedidos</Link>

                <Link href="/checkout">Checkout</Link>
              </>
            ) : (
              <Link href="/login">Entrar ou criar conta</Link>
            )}
          </div>

          <div className="footerColumn">
            <h4>Suporte</h4>
            <button type="button" className="footerLinkBtn" onClick={openChat}>Falar com o suporte</button>
            {isLoggedIn && <Link href="/orders">Abrir um ticket de um pedido</Link>}
          </div>

          <div className="footerColumn">
            <h4>Institucional</h4>
            <Link href="/privacidade">Política de Privacidade</Link>
            <Link href="/trocas-e-devolucoes">Trocas e Devoluções</Link>
            <Link href="/termos">Termos de Uso</Link>
          </div>
        </div>

        {hasLegalInfo && (
          <div className="footerLegalInfo">
            {legalName && <span>{legalName}</span>}
            {legalDocument && <span>{formatDocument(legalDocument)}</span>}
            {address && <span>{address}</span>}
            {contactEmail && <span>{contactEmail}</span>}
            {contactPhone && <span>{contactPhone}</span>}
          </div>
        )}
      </div>
      <div className="fim">
        <p>© 2026 {storeName}. Todos os direitos reservados.</p>
        {/* platformName vem de PLATFORM_LEGAL_NAME (obrigatória) — se o
            servidor subir sem essa env, cai vazio aqui em vez de imprimir
            a palavra "undefined" no rodapé de toda página da loja. */}
        {platformName && (
          <p className="footerPlatformDisclosure">
            Loja criada com {platformName} — a {platformName} fornece apenas a tecnologia; vendas e atendimento são
            de responsabilidade da loja.
          </p>
        )}
      </div>
    </footer>
  );
}
