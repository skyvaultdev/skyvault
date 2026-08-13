"use server";

const PRIVATE_ROUTES = [
  "/dashboard",
  "/profile",
  "/checkout",
];

// Subconjunto de PRIVATE_ROUTES que além de exigir login exige a
// permissão "dashboard.access" (área staff). As demais rotas privadas
// (perfil do cliente, checkout) só exigem estar logado — um cliente
// comum não tem "dashboard.access" e não pode ser bloqueado delas.
const STAFF_ONLY_ROUTES = [
  "/dashboard",
];

const PUBLIC_ONLY = [
  "/login",
  "/"
];

export function isPrivateRoute(pathname: string) {
  return PRIVATE_ROUTES.some(route =>
    pathname.startsWith(route)
  );
}

export function isStaffOnlyRoute(pathname: string) {
  return STAFF_ONLY_ROUTES.some(route =>
    pathname.startsWith(route)
  );
}

export function isPublicOnlyRoute(pathname: string) {
  return PUBLIC_ONLY.some(route =>
    pathname.startsWith(route)
  );
}
