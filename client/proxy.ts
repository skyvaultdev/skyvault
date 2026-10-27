import { authMiddleware } from "@/middlewares/auth.middleware";
import { devAuthMiddleware } from "@/middlewares/devAuth.middleware";
import { NextRequest } from "next/server";

export default function proxy(req: NextRequest) {
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
  ],
};
