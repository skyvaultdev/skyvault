import type { NextResponse } from "next/server";

export const AUTH_COOKIE_NAME = "auth_token";
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

// Cookie de sessão (staff/cliente) — centralizado aqui pra toda reemissão
// usar exatamente as mesmas flags. Antes, cada ponto que gerava o cookie
// (callbacks OAuth/magic-link, resync de permissão em auth.middleware.ts,
// 2FA) decidia sameSite por conta própria — parte usava "lax", parte
// "strict", fazendo a MESMA sessão se comportar diferente dependendo de
// quem reemitiu o cookie por último (ex: resync de permissão podia
// "deslogar" ao navegar a partir de um link externo, mesmo com uma sessão
// recém-criada em "lax" funcionando normalmente). "lax" é suficiente: o
// cookie já é httpOnly e toda rota sensível já exige a permissão certa —
// "strict" não cobria nenhum ataque a mais.
//
// Fica num módulo próprio (sem "use server") porque lib/jwt/init.ts TEM
// "use server" — um arquivo com essa diretiva só pode exportar funções
// async (vira Server Action), e setAuthCookie não precisa ser async.
export function setAuthCookie(response: NextResponse, token: string, maxAgeSeconds = AUTH_COOKIE_MAX_AGE) {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}
