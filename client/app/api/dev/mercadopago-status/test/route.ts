"use server";

import { fail, ok } from "@/lib/api/response";
import { requireDev } from "@/lib/devAuth/guard";
import { testMercadoPagoConnection } from "@/lib/payments/mercadoPagoProvider";

export async function POST() {
  try {
    const { denied } = await requireDev();
    if (denied) return denied;

    const result = await testMercadoPagoConnection();
    if (!result.ok) return fail(result.error ?? "MERCADOPAGO_TEST_FAILED", 502);

    return ok({ ok: true, accountEmail: result.accountEmail });
  } catch (error) {
    console.error("Erro ao testar conexão do Mercado Pago:", error);
    return fail("MERCADOPAGO_TEST_ERROR", 500);
  }
}
