// Next chama register() uma vez, no boot do processo — antes de qualquer
// requisição ser atendida. Sem isso, o pool do Postgres só existia depois
// que ALGUÉM abria uma página (app/layout.tsx era o único lugar que
// chamava initApp()); reiniciar o servidor e bater direto numa API (o
// webhook do Mercado Pago, por exemplo) dava 500 até a primeira página
// carregar. getDB()/getOrCreatePool() também inicializam sob demanda como
// rede de segurança, mas isso aqui é o que evita precisar dela.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initApp } = await import("@/lib/database/init");
    await initApp();

    // Sem SENTRY_DSN configurado, isso é um no-op (ver lib/observability/sentry.ts).
    const { initSentry } = await import("@/lib/observability/sentry");
    initSentry();
  }
}

// Hook nativo do Next (App Router) — chamado automaticamente sempre que
// um erro não tratado escapa de um Server Component/Route Handler/Server
// Action, independente de qualquer plugin de build do Sentry. Captura o
// erro "de graça" pros casos que não passam por um try/catch explícito
// nosso (os catches específicos de pagamento/entrega chamam
// captureException() diretamente, com contexto de orderId/stage).
export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
