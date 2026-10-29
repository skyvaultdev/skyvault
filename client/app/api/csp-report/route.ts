"use server";

import { NextResponse } from "next/server";
import { captureCspViolation } from "@/lib/observability/sentry";
import { rateLimit } from "@/lib/security/rateLimit";

// Endpoint de report-uri da CSP (ver next.config.ts, item 7 do plano de
// segurança) — nunca bloqueia nada por si só (depende do modo da CSP em
// si, CSP_MODE). O navegador manda isso sozinho sempre que algum recurso
// violaria a política; é assim que a gente descobre quais domínios do
// Mercado Pago/analytics ainda faltam antes de promover pra enforced (ver
// docs/security/csp.md). Sem auth de propósito — é o navegador do
// visitante que chama isso, não um staff logado.
//
// Item C2: agrega no Sentry (se configurado) em vez de só console.warn —
// com rate limit por (directive + blocked-uri), não por visitante/IP: uma
// violação IDÊNTICA (ex: uma extensão de navegador ruidosa, ou um recurso
// quebrado) pode vir de milhares de visitantes diferentes; sem isso, cada
// um estouraria a cota de eventos do Sentry do mesmo jeito. O console.warn
// continua acontecendo sempre, mesmo quando o envio pro Sentry é
// suprimido pelo rate limit — só o Sentry é que fica mais seletivo.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const report = body?.["csp-report"] ?? body;
    console.warn("[csp-report]", JSON.stringify(report));

    const directive = report?.["effective-directive"] ?? report?.["violated-directive"] ?? "unknown";
    const blockedUri = report?.["blocked-uri"] ?? "unknown";
    const fingerprint = `${directive}:${blockedUri}`;

    // 1 envio pro Sentry por violação única a cada 10 minutos.
    const allowed = await rateLimit(`csp-report:${fingerprint}`, 1, 10 * 60_000);
    if (allowed) {
      captureCspViolation({
        directive,
        blockedUri,
        documentUri: report?.["document-uri"],
        sourceFile: report?.["source-file"],
        lineNumber: report?.["line-number"],
      });
    }
  } catch (error) {
    console.error("[csp-report] erro ao processar relatório:", error);
  }
  // 204 sem corpo — o navegador não faz nada com a resposta, só precisa
  // de um status de sucesso pra não ficar reenviando o mesmo relatório.
  return new NextResponse(null, { status: 204 });
}
