import { authMiddleware } from "@/middlewares/auth.middleware";
import { devAuthMiddleware } from "@/middlewares/devAuth.middleware";
import { verifyInternalOrchestratorHeader } from "@/lib/security/internalRequest";
import { MUTATING_METHODS, isCsrfExcludedPath, checkCsrf } from "@/lib/security/csrfGuard";
import { config as appConfig } from "@/config/configuration";
import { NextRequest, NextResponse } from "next/server";

export default function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Item B2: camada extra pra /api/internal/** ANTES do handler da rota —
  // as 3 rotas lá dentro (sync-user, cron/expire-orders, cron/abandoned-
  // cart-email) já exigem este mesmo header (item 8, verifyInternalOrchestratorHeader),
  // então nenhum chamador existente precisa mudar nada; isso só adianta a
  // recusa pra antes mesmo de abrir conexão com o banco. 404 (não 401/403)
  // pra não confirmar que a rota existe pra quem não manda o header certo.
  if (pathname.startsWith("/api/internal")) {
    if (!verifyInternalOrchestratorHeader(req)) {
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.next();
  }

  // Item B3: CSRF (Sec-Fetch-Site/Origin), defesa em profundidade sobre o
  // resto de /api/** — toda rota mutável, exceto as explicitamente
  // excluídas (webhooks, csp-report; /api/internal já tratado acima).
  if (pathname.startsWith("/api/") && !isCsrfExcludedPath(pathname) && MUTATING_METHODS.has(req.method)) {
    const result = checkCsrf(req);
    if (result.suspicious) {
      if (appConfig.csrf.mode === "enforce") {
        return NextResponse.json({ error: "CSRF_BLOCKED" }, { status: 403 });
      }
      console.warn(`[CSRF report-only] ${req.method} ${pathname} seria bloqueado — ${result.reason}`);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/dev")) {
    return devAuthMiddleware(req);
  }
  return authMiddleware(req);
}

export const config = {
  // O matcher antigo ("/dashboard:path*", sem a barra antes de ":path*")
  // não é um padrão válido do Next — na prática só batia com a rota exata
  // "/dashboard" e "/dev", nunca com as sub-rotas. /checkout, /profile,
  // /reseller e /orders precisam estar aqui também: são rotas privadas
  // (ver middlewares/routeMap.ts) que dependiam só da proteção fraca de
  // cada API chamada, nunca do redirect pra /login no nível de página.
  matcher: [
    "/dashboard/:path*", "/dashboard",
    "/dev/:path*", "/dev",
    "/checkout/:path*",
    "/profile/:path*",
    "/reseller/:path*",
    "/orders/:path*",
    "/favoritos/:path*",
    "/api/:path*",
  ],
};
