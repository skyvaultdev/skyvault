import { REFERRAL_COOKIE_NAME, REFERRAL_COOKIE_MAX_AGE_DAYS } from "@/lib/resellers/referralCookie";

// Roda no client (página pública do produto) — lê ?ref=CODE da URL e
// grava o cookie de atribuição. Não valida o código aqui (isso é feito no
// servidor, em create-order) — só precisa não travar em nada, então
// qualquer erro aqui é silencioso, nunca deve quebrar a página do produto.
export function captureReferralFromUrl() {
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref) return;
    const maxAge = REFERRAL_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
    document.cookie = `${REFERRAL_COOKIE_NAME}=${encodeURIComponent(ref)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    // cookies bloqueados/indisponíveis — só não atribui, não é crítico
  }
}
