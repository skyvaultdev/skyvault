import { config } from "@/config/configuration";
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
// conta de verdade (não temos token ainda). Quando vocês tiverem o token
// sandbox, é bem provável que precise de um ajuste fino aqui (nome exato
// de algum campo, etc.) — não é algo que dê pra validar sem credencial.
export class MelhorEnvioShippingProvider implements ShippingProvider {
  async quote(req: QuoteRequest): Promise<ShippingQuote[]> {
    const { token, sandbox, userAgent } = config.shipping.melhorEnvio;
    if (!token) {
      throw new Error(
        "Melhor Envio não configurado (falta MELHOR_ENVIO_TOKEN). Use SHIPPING_PROVIDER=fixed_table enquanto isso."
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

    const baseUrl = sandbox ? SANDBOX_URL : PRODUCTION_URL;

    const res = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": userAgent,
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

    return Promise.all(
      validQuotes.map(async (item) => ({
        carrierId: item.company?.id ?? item.id,
        carrierName: item.company?.name ?? "Transportadora",
        serviceName: item.name,
        price: await applyShippingMarkup(Number(item.price)),
        etaDays: item.delivery_range?.max ?? item.delivery_time ?? 7,
      }))
    );
  }
}
