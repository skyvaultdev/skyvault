import * as Sentry from "@sentry/nextjs";

// Desabilitado por completo sem SENTRY_DSN configurado — nada é
// inicializado, nada é enviado, captureException() vira no-op. Item 9 do
// plano de segurança: sem isso, um erro silencioso em
// confirmOrderPayment/webhook/criação de pedido podia significar cliente
// pagou e não recebeu, sem ninguém saber (só um console.error perdido no
// log do processo).
const DSN = process.env.SENTRY_DSN;

let initialized = false;

export function initSentry() {
  if (initialized || !DSN) return;
  initialized = true;
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
  });
}

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "x-internal-secret",
  "x-internal-orchestrator",
  "x-cron-secret",
]);

// 11 dígitos, com ou sem pontuação (ex: 123.456.789-01 ou 12345678901) —
// não valida dígito verificador de propósito (não precisa, só precisa
// parecer um CPF o suficiente pra não vazar um número real por engano).
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

function scrubString(value: string): string {
  return value.replace(CPF_PATTERN, "[CPF removido]");
}

// Remove cookies/headers de autenticação e mascara CPF antes de QUALQUER
// evento sair pro Sentry — roda tanto nos erros automáticos capturados
// via onRequestError (ver instrumentation.ts) quanto nas chamadas manuais
// de captureException() abaixo.
function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
          delete event.request.headers[key];
        }
      }
    }
  }

  if (event.exception?.values) {
    for (const value of event.exception.values) {
      if (typeof value.value === "string") value.value = scrubString(value.value);
    }
  }

  if (event.message) event.message = scrubString(event.message);

  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      const v = event.extra[key];
      if (typeof v === "string") event.extra[key] = scrubString(v);
    }
  }

  return event;
}

export type ErrorContext = {
  storeId?: number | string | null;
  orderId?: number | string | null;
  stage?: string;
  [key: string]: unknown;
};

// Nunca inclua dados de pagamento (número de cartão, CVV, token do Brick,
// access token do Mercado Pago) no `context` passado aqui — mesmo que o
// beforeSend mascare CPF, ele não sabe reconhecer um número de cartão ou
// token de API por conteúdo. Passe só identificadores (storeId, orderId),
// nunca o payload bruto de pagamento.
export function captureException(error: unknown, context?: ErrorContext) {
  if (!DSN) return;
  Sentry.captureException(error, { extra: context });
}
