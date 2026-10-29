import type { Metadata } from "next";
import { loadStoreLegalInfo } from "../_legal/loadStoreLegalInfo";
import { renderPolicyParagraphs } from "../_legal/renderPolicyParagraphs";
import { buildDefaultPrivacyPolicy } from "@/lib/legal/defaultPolicies";
import "../_legal/legalDocument.css";

export async function generateMetadata(): Promise<Metadata> {
  const { storeName } = await loadStoreLegalInfo();
  return { title: `Política de Privacidade | ${storeName}` };
}

export default async function PrivacidadePage() {
  const info = await loadStoreLegalInfo();
  const text = info.privacyPolicy || buildDefaultPrivacyPolicy(info);

  return (
    <div className="termos-container">
      <h1 className="termos-title">Política de Privacidade</h1>
      <span className="termos-span"></span>
      {renderPolicyParagraphs(text)}
    </div>
  );
}
