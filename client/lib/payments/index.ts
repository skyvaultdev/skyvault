import { config } from "@/config/configuration";
import type { PaymentProvider } from "./PaymentProvider";
import { MockPaymentProvider } from "./mockProvider";
import { EfibankPaymentProvider } from "./efibankProvider";
import { isEfibankConfigured } from "./efibankCredentials";

// Escolhe automaticamente: se o dono da loja já cadastrou as credenciais
// da EfiBank na aba Configurações, usa elas de verdade. Sem credenciais,
// cai no mock (permite testar o checkout inteiro sem depender de conta
// real). PAYMENT_PROVIDER=mock no env força mock mesmo com credenciais
// salvas — útil pra dev local sem arriscar cobrar de verdade.
export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (config.payments.provider === "mock") {
    return new MockPaymentProvider();
  }

  if (await isEfibankConfigured()) {
    return new EfibankPaymentProvider();
  }

  return new MockPaymentProvider();
}
