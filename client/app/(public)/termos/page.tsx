import type { Metadata } from "next";
import { loadStoreLegalInfo } from "../_legal/loadStoreLegalInfo";
import { renderPolicyParagraphs } from "../_legal/renderPolicyParagraphs";
import { buildDefaultStoreTerms } from "@/lib/legal/defaultPolicies";
import "../_legal/legalDocument.css";

// Termos de uso DA LOJA, voltados pro comprador — não confundir com
// app/(public)/termos-plataforma (contrato da plataforma com o lojista).
export async function generateMetadata(): Promise<Metadata> {
  const { storeName } = await loadStoreLegalInfo();
  return { title: `Termos de Uso | ${storeName}` };
}

export default async function TermosPage() {
  const info = await loadStoreLegalInfo();
  const text = info.storeTerms || buildDefaultStoreTerms(info);

  return (
    <div className="termos-container">
      <h1 className="termos-title">Termos de Uso</h1>
      <span className="termos-span"></span>
      {renderPolicyParagraphs(text)}
    </div>
  );
}
