"use server";

import { fail, ok } from "@/lib/api/response";
import { requireDev } from "@/lib/devAuth/guard";
import { loadMelhorEnvioCredentials } from "@/lib/shipping/melhorEnvioCredentials";

const SANDBOX_URL = "https://sandbox.melhorenvio.com.br";
const PRODUCTION_URL = "https://melhorenvio.com.br";

async function fetchJson(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "SkyVault (contato@skyvault.local)",
    },
    cache: "no-store",
  });
  const status = res.status;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status, ok: res.ok, body };
}

// Somente leitura, só pra dev: busca o que a API do Melhor Envio devolve
// pra conta ligada ao token que o dono salvou (dados da conta + serviços de
// transportadora disponíveis) — o token nunca sai daqui, só o resultado.
export async function POST() {
  try {
    const { denied } = await requireDev();
    if (denied) return denied;

    const creds = await loadMelhorEnvioCredentials();
    if (!creds) return fail("NOT_CONFIGURED", 409);

    const baseUrl = creds.sandbox ? SANDBOX_URL : PRODUCTION_URL;

    const [me, companies] = await Promise.all([
      fetchJson(`${baseUrl}/api/v2/me`, creds.accessToken),
      fetchJson(`${baseUrl}/api/v2/me/shipment/companies`, creds.accessToken),
    ]);

    return ok({
      environment: creds.sandbox ? "sandbox" : "production",
      account: me,
      companies,
    });
  } catch (error) {
    console.error("Erro ao buscar dados brutos do Melhor Envio:", error);
    return fail("MELHOR_ENVIO_RAW_FETCH_ERROR", 500);
  }
}
