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

    const { config } = await import("@/config/configuration");

    // Chave de dados em repouso ausente = credencial de integração
    // ilegível, não é degradação — diferente de REDIS_URL (ver abaixo),
    // isso trava a subida em produção de propósito.
    if (process.env.NODE_ENV === "production" && !config.integration.encryptionKey) {
      throw new Error(
        "INTEGRATION_ENCRYPTION_KEY não configurada em produção — obrigatória pra cifrar/decifrar " +
        "credenciais de integração (ver lib/security/tokenCrypto.ts). Boot abortado."
      );
    }

    // Item B4: REDIS_URL ausente em produção é DEGRADAÇÃO, não dado
    // ilegível (diferente do bloco acima) — cada réplica volta a contar
    // rate limit sozinha, sub-contando o limite real por N réplicas. Isso
    // não trava o boot (derrubar o deploy inteiro por isso seria
    // desproporcional ao risco), mas precisa ficar bem visível: log de
    // erro + Sentry (se configurado), e GET /api/health reporta o estado.
    if (process.env.NODE_ENV === "production" && !config.redis.url) {
      const message = "REDIS_URL não configurada em produção — rate limit cai pro fallback em memória por instância (sub-conta o limite real com múltiplas réplicas).";
      console.error(`[boot] ${message}`);
      const { captureException } = await import("@/lib/observability/sentry");
      captureException(new Error(message), { stage: "boot" });
    }

    // Item e do deploy — desligado por padrão (INTERNAL_CRON_ENABLED=true
    // pra ligar). Ver lib/cron/internalScheduler.ts.
    const { startInternalCronScheduler } = await import("@/lib/cron/internalScheduler");
    startInternalCronScheduler();
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
