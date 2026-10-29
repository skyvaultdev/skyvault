import { NextRequest } from "next/server";

// Item B3 — defesa contra CSRF em rotas mutáveis, sem token clássico
// (B3 do plano pede Sec-Fetch-Site/Origin, não um token CSRF). Aplicado só
// em POST/PUT/PATCH/DELETE (GET nunca muda estado, não precisa checar).
export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Caminhos que nunca passam por aqui, mesmo sendo mutáveis: webhooks são
// chamados servidor-a-servidor por terceiros (nunca têm Origin/Sec-Fetch-
// Site de navegador pra começo de conversa — mas excluído explicitamente,
// não por acaso); /api/csp-report recebe POST do próprio navegador do
// visitante reportando violação de CSP, sem relação com sessão/cookie;
// /api/internal/** já tem sua própria camada (item B2), checada antes
// desta em proxy.ts.
const EXCLUDED_PREFIXES = ["/api/webhooks", "/api/csp-report", "/api/internal"];

export function isCsrfExcludedPath(pathname: string): boolean {
  return EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p));
}

export type CsrfCheckResult = { suspicious: false } | { suspicious: true; reason: string };

// Requisição sem Origin E sem Sec-Fetch-Site não veio de um navegador
// (curl, servidor-a-servidor, apps não-browser) — não há Origin de
// navegador nenhum pra validar aqui, deixa passar.
//
// Com Sec-Fetch-Site (a maioria dos navegadores modernos manda): só
// "same-origin" (mesma origem exata) e "none" (navegação direta/digitada,
// nunca iniciada por outro site) passam.
//
// Sem Sec-Fetch-Site mas COM Origin (clients mais antigos): compara o
// host do Origin com o host da PRÓPRIA requisição (multi-tenant — cada
// loja é um host diferente; não existe uma lista fixa de hosts permitidos
// aqui, "same-origin" é sempre relativo a quem está sendo chamado).
export function checkCsrf(req: NextRequest): CsrfCheckResult {
  const origin = req.headers.get("origin");
  const secFetchSite = req.headers.get("sec-fetch-site");

  if (!origin && !secFetchSite) {
    return { suspicious: false };
  }

  if (secFetchSite) {
    if (secFetchSite === "same-origin" || secFetchSite === "none") {
      return { suspicious: false };
    }
    return { suspicious: true, reason: `sec-fetch-site=${secFetchSite}` };
  }

  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return { suspicious: true, reason: `origin inválida: ${origin}` };
    }
    const requestHost = req.headers.get("host") ?? req.nextUrl.host;
    if (originHost !== requestHost) {
      return { suspicious: true, reason: `origin=${origin} (host ${originHost}) != host da requisição (${requestHost})` };
    }
    return { suspicious: false };
  }

  return { suspicious: false };
}
