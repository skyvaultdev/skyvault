import type { Metadata } from "next";
import { config } from "@/config/configuration";
import "../_legal/legalDocument.css";
import PlatformTermsContent from "./PlatformTermsContent";

// Contrato da PLATAFORMA (SkyVault/quem fornece a tecnologia) com o
// LOJISTA — não é o termos de uso da loja pro comprador (isso é
// app/(public)/termos). Não aparece no header/footer da loja de propósito
// (ver item 2b da tarefa) — só é acessado pelo dashboard (aceite
// obrigatório do owner) e pelo /dev.
export const metadata: Metadata = {
  title: "Termos e Condições da Plataforma",
  robots: { index: false, follow: false },
};

export default function TermosPlataformaPage() {
  return (
    <div className="termos-container">
      <PlatformTermsContent platformName={config.platform.legalName} platformContactEmail={config.platform.contactEmail} />
    </div>
  );
}
