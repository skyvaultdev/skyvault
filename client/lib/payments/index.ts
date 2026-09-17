import { config } from "@/config/configuration";
import type { PaymentProvider } from "./PaymentProvider";
import { MockPaymentProvider } from "./mockProvider";
import { MercadoPagoProvider } from "./mercadoPagoProvider";
import { isMercadoPagoConfigured } from "./mercadoPagoCredentials";

// Escolhe automaticamente: se o dono da loja já cadastrou as credenciais
// do Mercado Pago na aba Configurações, usa elas de verdade. Sem
// credenciais, cai no mock (permite testar o checkout inteiro sem conta
// real). PAYMENT_PROVIDER=mock no env força mock mesmo com credenciais
// salvas — útil pra dev local sem arriscar cobrar de verdade.
export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (config.payments.provider === "mock") {
    return new MockPaymentProvider();
  }

  if (await isMercadoPagoConfigured()) {
    return new MercadoPagoProvider();
  }

  return new MockPaymentProvider();
}
