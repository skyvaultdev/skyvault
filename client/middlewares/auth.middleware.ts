import { NextRequest, NextResponse } from "next/server";
import { verifyJWT, signJWT } from "@/lib/jwt/init";
import { setAuthCookie } from "@/lib/jwt/cookie";
import { isPrivateRoute, isStaffOnlyRoute } from "./routeMap";
import { config } from "@/config/configuration";

export async function authMiddleware(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  const { pathname } = req.nextUrl;

  const isPrivate = isPrivateRoute(pathname);

  if (!token) {
    if (isPrivate) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const decrypted = await verifyJWT(token);
  if (!decrypted) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Rotas privadas "normais" (perfil, checkout, revendedor, pedidos) só
  // precisam confirmar que o JWT é válido — quem decide o que o cliente
  // pode fazer ali é a API chamada, não o cargo/permissões de staff. Só
  // /dashboard decide acesso aqui no middleware com base em
  // "dashboard.access", e só por isso precisa reconsultar o cargo/
  // permissões atuais a cada request (ver sync-user).
  if (!isStaffOnlyRoute(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next();
  const syncRes = await fetch(
    new URL("/api/internal/sync-user", config.WEBSITE_URL),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": config.internalApi.secret,
        "x-internal-orchestrator": config.internalApi.orchestratorToken ?? "",
      },
      body: JSON.stringify({ email: decrypted.email, sid: decrypted.sid }),
    }
  );

  const { role, permissions, totpEnabled } = await syncRes.json();
  const roleChanged = decrypted.role !== role;
  const permsChanged = JSON.stringify(decrypted.permissions) !== JSON.stringify(permissions);

  if (roleChanged || permsChanged) {
    const newToken = await signJWT({
      sid: decrypted.sid,
      email: decrypted.email,
      role,
      permissions,
      // Preserva o aceite de 2FA já feito — sincronizar cargo/permissões
      // não deveria, por si só, forçar o staff a digitar o código de novo.
      twoFaVerifiedAt: decrypted.twoFaVerifiedAt,
    });

    setAuthCookie(response, newToken);
  }

  // Chegou até aqui só é possível numa rota staff-only (early return acima
  // cobre o resto) — isStaffOnlyRoute não precisa ser checado de novo.
  if (!permissions.includes("dashboard.access")) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // 2FA (opcional, por conta) — quem ligou precisa confirmar o código uma
  // vez por sessão antes de usar o resto do dashboard. A própria tela de
  // desafio é exemptada (senão ela mesma ficaria presa num loop de redirect).
  if (totpEnabled && !decrypted.twoFaVerifiedAt && pathname !== "/dashboard/2fa-challenge") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard/2fa-challenge";
    return NextResponse.redirect(url);
  }

  return response;
}