import { config } from "@/config/configuration";
import type { ShippingProvider } from "./ShippingProvider";
import { FixedTableShippingProvider } from "./fixedTableProvider";
import { MelhorEnvioShippingProvider } from "./melhorEnvioProvider";
import { isMelhorEnvioConfigured } from "./melhorEnvioCredentials";

// Mesmo padrão de lib/payments/index.ts: SHIPPING_PROVIDER=fixed_table força
// a tabela fixa mesmo com token cadastrado (útil pra dev local); fora isso,
// usa Melhor Envio automaticamente assim que o dono configurar o token na
// aba Transportadoras, sem precisar mexer em env var nenhuma.
export async function getShippingProvider(): Promise<ShippingProvider> {
  if (config.shipping.provider === "fixed_table") {
    return new FixedTableShippingProvider();
  }
  if (await isMelhorEnvioConfigured()) {
    return new MelhorEnvioShippingProvider();
  }
  return new FixedTableShippingProvider();
}

export * from "./ShippingProvider";
