import { authMiddleware } from "@/middlewares/auth.middleware";
import { devAuthMiddleware } from "@/middlewares/devAuth.middleware";
import { verifyInternalOrchestratorHeader } from "@/lib/security/internalRequest";
import { NextRequest, NextResponse } from "next/server";

export default function proxy(req: NextRequest) {
  // Item B2: camada extra pra /api/internal/** ANTES do handler da rota —
  // as 3 rotas lá dentro (sync-user, cron/expire-orders, cron/abandoned-
  // cart-email) já exigem este mesmo header (item 8, verifyInternalOrchestratorHeader),
  // então nenhum chamador existente precisa mudar nada; isso só adianta a
  // recusa pra antes mesmo de abrir conexão com o banco. 404 (não 401/403)
  // pra não confirmar que a rota existe pra quem não manda o header certo.
  if (req.nextUrl.pathname.startsWith("/api/internal")) {
    if (!verifyInternalOrchestratorHeader(req)) {
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/dev")) {
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
    "/api/internal/:path*",
  ],
};
