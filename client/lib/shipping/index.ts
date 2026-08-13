import { config } from "@/config/configuration";
import type { ShippingProvider } from "./ShippingProvider";
import { FixedTableShippingProvider } from "./fixedTableProvider";
import { MelhorEnvioShippingProvider } from "./melhorEnvioProvider";

export function getShippingProvider(): ShippingProvider {
  if (config.shipping.provider === "melhor_envio") {
    return new MelhorEnvioShippingProvider();
  }
  return new FixedTableShippingProvider();
}

export * from "./ShippingProvider";
