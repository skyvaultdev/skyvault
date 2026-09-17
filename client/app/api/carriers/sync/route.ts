"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { loadMelhorEnvioCredentials } from "@/lib/shipping/melhorEnvioCredentials";

const SANDBOX_URL = "https://sandbox.melhorenvio.com.br";
const PRODUCTION_URL = "https://melhorenvio.com.br";

type MelhorEnvioQuote = {
  id: number;
  name: string;
  company?: { id: number; name: string };
};

// Descobre quais transportadoras/serviços a conta Melhor Envio do dono tem
// disponível: faz uma cotação de teste (CEP de origem → CEP de origem, com
// um pacote mínimo — só interessa a LISTA de serviços que respondem, não o
// preço/prazo pra essa rota específica) e grava cada serviço em `carriers`.
// Não ativa nada automaticamente: linha nova entra com active=false, e uma
// linha já existente mantém o active que o dono já tinha escolhido — só o
// nome/código são atualizados. O dono decide manualmente quais ligar,
// como já fazia antes pro cadastro manual.
export async function POST() {
  try {
    const { denied } = await requirePermission("shipping.manage");
    if (denied) return denied;

    const credentials = await loadMelhorEnvioCredentials();
    if (!credentials) {
      return fail("MELHOR_ENVIO_NOT_CONFIGURED", 409);
    }

    const db = getDB();
    const originRes = await db.query(`SELECT origin_cep FROM store_settings ORDER BY id DESC LIMIT 1`);
    const originCep = originRes.rows[0]?.origin_cep;
    if (!originCep) {
      return fail("SHIPPING_ORIGIN_NOT_CONFIGURED", 409);
    }

    const baseUrl = credentials.sandbox ? SANDBOX_URL : PRODUCTION_URL;
    const res = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "SkyVault (contato@skyvault.local)",
      },
      body: JSON.stringify({
        from: { postal_code: originCep },
        to: { postal_code: originCep },
        package: { weight: 0.3, width: 11, height: 2, length: 16 },
      }),
    });

    if (!res.ok) {
      return fail("MELHOR_ENVIO_REQUEST_FAILED", 502);
    }

    const data: MelhorEnvioQuote[] = await res.json();
    const services = data.filter((item) => item.company);

    let synced = 0;
    for (const item of services) {
      const name = `${item.company!.name} ${item.name}`;
      await db.query(
        `INSERT INTO carriers (name, service_code, melhor_envio_service_id, active)
         VALUES ($1, $2, $3, false)
         ON CONFLICT (melhor_envio_service_id)
         WHERE melhor_envio_service_id IS NOT NULL
         DO UPDATE SET name = EXCLUDED.name, service_code = EXCLUDED.service_code`,
        [name, String(item.company!.id), item.id]
      );
      synced++;
    }

    return ok({ synced, total: services.length });
  } catch (error) {
    console.error("Erro ao sincronizar transportadoras:", error);
    return fail("CARRIERS_SYNC_ERROR", 500);
  }
}
