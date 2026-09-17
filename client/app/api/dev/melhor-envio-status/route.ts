"use server";

import { fail, ok } from "@/lib/api/response";
import { requireDev } from "@/lib/devAuth/guard";
import { loadMelhorEnvioCredentials } from "@/lib/shipping/melhorEnvioCredentials";

// Somente leitura: confere se a loja configurou o token do Melhor Envio,
// sem nunca expor o token em si pros devs.
export async function GET() {
  try {
    const { denied } = await requireDev();
    if (denied) return denied;

    const creds = await loadMelhorEnvioCredentials();

    return ok({
      configured: creds !== null,
      sandbox: creds?.sandbox ?? true,
    });
  } catch (error) {
    console.error("Erro ao buscar status do Melhor Envio:", error);
    return fail("MELHOR_ENVIO_STATUS_FETCH_ERROR", 500);
  }
}
