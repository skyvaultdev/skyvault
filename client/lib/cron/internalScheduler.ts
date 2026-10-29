import { config } from "@/config/configuration";

// Item e do deploy na Square Cloud — a plataforma não tem agendador nativo
// (cron), então alguém precisa disparar periodicamente POST
// /api/internal/cron/{expire-orders,abandoned-cart-email}. Em vez de um
// serviço externo (GitHub Actions schedule, cron-job.org — ver
// docs/deploy/squarecloud.md pra essa alternativa), este scheduler roda
// DENTRO do próprio processo e chama as mesmas rotas via HTTP
// loopback (127.0.0.1, não a URL pública) — passa pelos MESMOS dois
// headers que um chamador externo precisaria mandar (x-cron-secret,
// x-internal-orchestrator), não contorna a checagem existente.
//
// Desligado por padrão (INTERNAL_CRON_ENABLED=true pra ligar) — evita
// disparo duplicado caso você prefira configurar um agendador externo em
// vez deste. Só faz sentido com UMA instância rodando (não distribui
// entre réplicas, ao contrário do rate limit via Redis) — adequado pro
// container único da Square Cloud.

const EXPIRE_ORDERS_INTERVAL_MS = 60 * 60 * 1000; // 1h, mesma cadência do crontab documentado
const ABANDONED_CART_INTERVAL_MS = 60 * 60 * 1000; // 1h

async function callInternalCron(path: string): Promise<void> {
  const port = process.env.PORT || "3000";
  const url = `http://127.0.0.1:${port}${path}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-cron-secret": config.cron.secret ?? "",
        "x-internal-orchestrator": config.internalApi.orchestratorToken ?? "",
      },
    });
    if (!res.ok) {
      console.error(`[internalScheduler] ${path} respondeu ${res.status}`);
    }
  } catch (err) {
    console.error(`[internalScheduler] falha ao chamar ${path}:`, err);
  }
}

let started = false;

// Guard contra múltiplas chamadas (hot-reload em dev chama register() de
// novo a cada mudança de arquivo — mesmo padrão já usado em
// lib/observability/sentry.ts pro initSentry()).
export function startInternalCronScheduler(): void {
  if (started) return;
  if (process.env.INTERNAL_CRON_ENABLED !== "true") return;
  if (!config.cron.secret || !config.internalApi.orchestratorToken) {
    console.error(
      "[internalScheduler] INTERNAL_CRON_ENABLED=true mas CRON_SECRET/INTERNAL_ORCHESTRATOR_TOKEN não configurados — scheduler NÃO iniciado."
    );
    return;
  }
  started = true;

  setInterval(() => void callInternalCron("/api/internal/cron/expire-orders"), EXPIRE_ORDERS_INTERVAL_MS);
  setInterval(() => void callInternalCron("/api/internal/cron/abandoned-cart-email"), ABANDONED_CART_INTERVAL_MS);
  console.log("[internalScheduler] iniciado — expire-orders e abandoned-cart-email a cada 1h.");
}
