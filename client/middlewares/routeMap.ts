"use server";

const PRIVATE_ROUTES = [
  "/dashboard",
  "/profile",
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

export function isPublicOnlyRoute(pathname: string) {
  return PUBLIC_ONLY.some(route =>
    pathname.startsWith(route)
  );
}
