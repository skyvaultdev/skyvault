"use server";

import { fail, ok } from "@/lib/api/response";
import { requireDev } from "@/lib/devAuth/guard";
import { isMercadoPagoConfigured } from "@/lib/payments/mercadoPagoCredentials";
import { config } from "@/config/configuration";

// Somente leitura de propósito: os devs conferem se o .env do servidor tem
// as credenciais do Mercado Pago (MERCADO_PAGO_ACCESS_TOKEN/PUBLIC_KEY)
// configuradas e funcionando, nunca veem o token em si.
export async function GET() {
  try {
    const { denied } = await requireDev();
    if (denied) return denied;

    return ok({
      configured: await isMercadoPagoConfigured(),
      sandbox: config.payments.mercadoPago.sandbox,
      source: "env",
    });
  } catch (error) {
    console.error("Erro ao buscar status do Mercado Pago:", error);
    return fail("MERCADOPAGO_STATUS_FETCH_ERROR", 500);
  }
}
