"use client";

import Link from "next/link";
import "./footer.css";

type Props = {
  storeName: string;
  isLoggedIn: boolean;
};

export default function Footer({ storeName, isLoggedIn }: Props) {
  function openChat() {
    window.dispatchEvent(new Event("abrirChat"));
  }

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
                
                <Link href="/checkout">checkout</Link>
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
            <Link href="/terms">Termos de uso</Link>
          </div>
        </div>
      </div>
      <div className="fim">
        <p>© 2026 {storeName}. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
