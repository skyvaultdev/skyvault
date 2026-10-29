import { config } from "@/config/configuration";
import type { PaymentProvider } from "./PaymentProvider";
import { MockPaymentProvider } from "./mockProvider";
import { MercadoPagoProvider } from "./mercadoPagoProvider";
import { isMercadoPagoConfigured } from "./mercadoPagoCredentials";

// Lançado quando chegaria no mock por falta de credenciais, mas o processo
// está em produção — nunca pode cair silenciosamente pro mock aí, senão
// qualquer cliente "pagaria" de graça. /api/checkout/pay trata isso como
// 503 com uma mensagem clara em vez do 500 genérico.
export class PaymentNotConfiguredError extends Error {
  constructor() {
    super("PAYMENT_NOT_CONFIGURED");
    this.name = "PaymentNotConfiguredError";
  }
}

// Escolhe automaticamente: se o dono da loja já cadastrou as credenciais
// do Mercado Pago na aba Configurações, usa elas de verdade. Sem
// credenciais, cai no mock (permite testar o checkout inteiro sem conta
// real) — mas só fora de produção. PAYMENT_PROVIDER=mock no env força mock
// mesmo com credenciais salvas — útil pra dev local sem arriscar cobrar de
// verdade, e também libera o mock em produção se for mesmo essa a intenção
// explícita de quem administra o servidor.
export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (config.payments.provider === "mock") {
    return new MockPaymentProvider();
  }

  if (await isMercadoPagoConfigured()) {
    return new MercadoPagoProvider();
  }

  if (process.env.NODE_ENV === "production") {
    throw new PaymentNotConfiguredError();
  }

  return new MockPaymentProvider();
}
