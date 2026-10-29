"use client";

import { useEffect } from "react";
import "./system-pages.css";

// error.tsx PRECISA ser Client Component (regra do Next) — é o boundary
// que recebe o erro não tratado de qualquer Server/Client Component
// abaixo dele na árvore e decide o que mostrar em vez de uma tela branca.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro não tratado na página:", error);
  }, [error]);

  return (
    <main className="systemPage">
      <div className="systemCard">
        <h1 className="systemTitle">Algo deu errado</h1>
        <p className="systemText">
          Tivemos um problema ao carregar esta página. Você pode tentar de novo ou voltar para o início.
        </p>
        <div className="systemActions">
          <button type="button" className="systemBtn systemBtnPrimary" onClick={() => reset()}>
            Tentar de novo
          </button>
          <a href="/" className="systemBtn systemBtnSecondary">
            Ir para a página inicial
          </a>
        </div>
      </div>
    </main>
  );
}
