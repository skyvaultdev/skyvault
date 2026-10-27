import type { Metadata } from "next";
import { loadStoreLegalInfo } from "../_legal/loadStoreLegalInfo";
import { renderPolicyParagraphs } from "../_legal/renderPolicyParagraphs";
import { buildDefaultReturnsPolicy } from "@/lib/legal/defaultPolicies";
import "../_legal/legalDocument.css";

export async function generateMetadata(): Promise<Metadata> {
  const { storeName } = await loadStoreLegalInfo();
  return { title: `Trocas e Devoluções | ${storeName}` };
}

export default async function TrocasEDevolucoesPage() {
  const info = await loadStoreLegalInfo();
  const text = info.returnsPolicy || buildDefaultReturnsPolicy(info);

  return (
    <div className="termos-container">
      <h1 className="termos-title">Política de Trocas e Devoluções</h1>
      <span className="termos-span"></span>
      {renderPolicyParagraphs(text)}
    </div>
  );
}
