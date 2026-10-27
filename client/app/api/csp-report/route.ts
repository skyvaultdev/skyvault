"use server";

import { NextResponse } from "next/server";

// Endpoint de report-uri da CSP (ver next.config.ts, item 7 do plano de
// segurança) — só loga, nunca bloqueia nada (a CSP em si está em modo
// Report-Only). O navegador manda isso sozinho sempre que algum recurso
// violaria a política; é assim que a gente descobre quais domínios do
// Mercado Pago/analytics ainda faltam antes de promover pra enforced (ver
// docs/security/csp.md). Sem auth de propósito — é o navegador do
// visitante que chama isso, não um staff logado.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const report = body?.["csp-report"] ?? body;
    console.warn("[csp-report]", JSON.stringify(report));
  } catch (error) {
    console.error("[csp-report] erro ao processar relatório:", error);
  }
  // 204 sem corpo — o navegador não faz nada com a resposta, só precisa
  // de um status de sucesso pra não ficar reenviando o mesmo relatório.
  return new NextResponse(null, { status: 204 });
}
