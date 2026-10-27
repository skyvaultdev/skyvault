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
          // TODO: Content-Security-Policy — precisa de uma configuração
          // cuidadosa antes de ligar (o Payment Brick do Mercado Pago
          // carrega scripts/iframes de domínios deles; uma CSP genérica
          // quebraria o checkout). Fazer numa tarefa separada, testando o
          // fluxo de pagamento inteiro antes de ir pra produção.
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
