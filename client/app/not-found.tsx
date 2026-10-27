import Link from "next/link";
import "./system-pages.css";

// Renderizado pelo Next automaticamente sempre que notFound() é chamado
// (ou numa rota que não existe) — dentro do layout raiz, então já tem
// header/footer/tema da loja em volta.
export default function NotFound() {
  return (
    <main className="systemPage">
      <div className="systemCard">
        <p className="systemCode">404</p>
        <h1 className="systemTitle">Página não encontrada</h1>
        <p className="systemText">
          O link pode estar quebrado, ou a página pode ter sido removida ou renomeada.
        </p>
        <div className="systemActions">
          <Link href="/" className="systemBtn systemBtnPrimary">
            Ir para a página inicial
          </Link>
          <Link href="/catalog" className="systemBtn systemBtnSecondary">
            Ver catálogo
          </Link>
        </div>
      </div>
    </main>
  );
}
