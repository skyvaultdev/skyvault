import { getDB } from "@/lib/database/db";
import { loadMelhorEnvioCredentials } from "./melhorEnvioCredentials";
import type { ShippingProvider, QuoteRequest, ShippingQuote } from "./ShippingProvider";
import { applyShippingMarkup } from "./markup";

const SANDBOX_URL = "https://sandbox.melhorenvio.com.br";
const PRODUCTION_URL = "https://melhorenvio.com.br";

type MelhorEnvioQuote = {
  id: number;
  name: string;
  price: string | null;
  error?: string | null;
  delivery_time?: number;
  delivery_range?: { min: number; max: number };
  company?: { id: number; name: string };
};

// Integração real com o Melhor Envio — escrita a partir da documentação
// pública da API v2 (calculadora de frete), mas NUNCA testada contra uma
// conta de verdade. Quando o dono cadastrar o token sandbox, é bem
// provável que precise de um ajuste fino aqui (nome exato de algum campo,
// etc.) — não é algo que dê pra validar sem credencial.
export class MelhorEnvioShippingProvider implements ShippingProvider {
  async quote(req: QuoteRequest): Promise<ShippingQuote[]> {
    const credentials = await loadMelhorEnvioCredentials();
    if (!credentials) {
      throw new Error(
        "Melhor Envio não configurado — cadastre o token na aba Transportadoras."
      );
    }
    if (!req.originCep) {
      throw new Error("SHIPPING_ORIGIN_NOT_CONFIGURED");
    }

    // Simplificação: consolida os itens do carrinho num único "pacote"
    // (peso somado, maior comprimento/largura, alturas somadas) — não faz
    // bin-packing de verdade. Suficiente pra maioria dos casos, mas pode
    // superestimar o frete em carrinhos com itens físicos bem diferentes.
    const totalWeightKg = Math.max(
      req.packages.reduce((sum, p) => sum + (p.weightGrams * p.quantity) / 1000, 0),
      0.1
    );
    const length = Math.max(...req.packages.map((p) => p.lengthCm), 16);
    const width = Math.max(...req.packages.map((p) => p.widthCm), 11);
    const height = Math.min(
      req.packages.reduce((sum, p) => sum + p.heightCm * p.quantity, 0) || 2,
      100
    );

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
        from: { postal_code: req.originCep },
        to: { postal_code: req.destinationCep },
        package: {
          weight: totalWeightKg,
          width,
          height,
          length,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Melhor Envio respondeu ${res.status}`);
    }

    const data: MelhorEnvioQuote[] = await res.json();
    const validQuotes = data.filter((item) => !item.error && item.price);

    // Só entram no checkout as transportadoras/serviços que o dono
    // sincronizou e deixou ativos (carriers.active) — antes disso a API
    // devolvia TODAS as opções da conta sem filtro nenhum. Também é aqui
    // que traduzimos o id de serviço do Melhor Envio pro id local da
    // tabela carriers: shipping_quotes.carrier_id/shipments.carrier_id são
    // FK pra carriers(id), não pro id bruto da API — usar o id da API
    // direto quebraria essa referência.
    const db = getDB();
    const activeRes = await db.query<{ id: number; melhor_envio_service_id: number }>(
      `SELECT id, melhor_envio_service_id FROM carriers
       WHERE active = true AND melhor_envio_service_id IS NOT NULL`
    );
    const activeByServiceId = new Map(activeRes.rows.map((row) => [row.melhor_envio_service_id, row.id]));

    const activeQuotes = validQuotes.filter((item) => activeByServiceId.has(item.id));

    return Promise.all(
      activeQuotes.map(async (item) => ({
        carrierId: activeByServiceId.get(item.id) ?? null,
        carrierName: item.company?.name ?? "Transportadora",
        serviceName: item.name,
        price: await applyShippingMarkup(Number(item.price)),
        etaDays: item.delivery_range?.max ?? item.delivery_time ?? 7,
      }))
    );
  }
}
