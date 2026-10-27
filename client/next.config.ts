import type { NextConfig } from "next";

// Lista de origens externas liberadas pro dev server (ex: um túnel ngrok/
// Cloudflare usado pra testar webhooks e OAuth redirects localmente) —
// antes vinha fixo no código (um domínio ngrok específico), o que
// quebrava toda vez que o túnel mudava e vazava esse domínio pro
// histórico do git sem necessidade. Vazio = nenhuma origem extra liberada
// (comportamento padrão do Next, só localhost).
const devAllowedOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// CSP em modo Report-Only (item 7 do plano de segurança) — NUNCA bloqueia
// nada, só reporta violação pra /api/csp-report. Lista de domínios do
// Mercado Pago (Payment Brick) é um primeiro rascunho (sdk.mercadopago.com
// confirmado em uso no checkout; os demais — api/secure-fields/eventos —
// cobertos via wildcard porque não há uma lista oficial publicada pelo MP)
// e de analytics (GA4/Meta Pixel, só carregados se configurados). Ver
// docs/security/csp.md pro passo de promoção pra enforced depois de rodar
// o checkout completo e revisar os relatórios reais.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  // 'unsafe-inline' em script/style é um gap conhecido (ver doc) — os
  // scripts inline do GA4/Meta Pixel e o uso extensivo de style={{}} no
  // app exigiriam nonce por request (mudança maior, fora do escopo deste
  // primeiro rascunho report-only).
  "script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mlstatic.com https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mlstatic.com https://www.google-analytics.com https://analytics.google.com https://www.facebook.com https://connect.facebook.net",
  "frame-src 'self' https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "report-uri /api/csp-report",
].join("; ");

const nextConfig: NextConfig = {
  serverExternalPackages: [], // opcional
  logging: {
    fetches: { fullUrl: true },
  },
  // `serverActions.allowedOrigins` só libera Server Actions (POSTs de
  // formulário com "use server"). Sem `allowedDevOrigins` (config
  // separada, fora de "experimental" a partir do Next 15.3+), o dev
  // server bloqueia/avisa em QUALQUER requisição vinda de um host
  // diferente de localhost — inclusive os payloads RSC que carregam a
  // página e os dados do banco. É isso que faz parecer que "o túnel não
  // puxa a DB": a página nem termina de carregar direito por ele.
  allowedDevOrigins: devAllowedOrigins,
  experimental: {
    serverActions: {
      allowedOrigins: devAllowedOrigins,
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // Report-Only: nunca bloqueia nada, só reporta. Ver
          // docs/security/csp.md pro passo de promoção pra enforced.
          { key: "Content-Security-Policy-Report-Only", value: CSP_DIRECTIVES },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
