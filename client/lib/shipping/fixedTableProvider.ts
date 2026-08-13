import { getDB } from "@/lib/database/db";
import type { ShippingProvider, QuoteRequest, ShippingQuote } from "./ShippingProvider";
import { applyShippingMarkup } from "./markup";

// v1: tabela fixa por faixa de peso, sem diferenciar por região/CEP ainda
// (Correios direto vs agregador é decisão em aberto — ver o plano — troca
// só a implementação atrás de ShippingProvider quando decidirem).
const WEIGHT_BRACKETS = [
  { maxGrams: 500, price: 18 },
  { maxGrams: 1000, price: 25 },
  { maxGrams: 3000, price: 38 },
  { maxGrams: 5000, price: 52 },
  { maxGrams: 10000, price: 75 },
];
const PER_KG_ABOVE_MAX = 6;
const STANDARD_ETA_DAYS = 7;

function basePriceForWeight(totalGrams: number): number {
  for (const bracket of WEIGHT_BRACKETS) {
    if (totalGrams <= bracket.maxGrams) return bracket.price;
  }
  const last = WEIGHT_BRACKETS[WEIGHT_BRACKETS.length - 1];
  const extraKg = Math.ceil((totalGrams - last.maxGrams) / 1000);
  return last.price + extraKg * PER_KG_ABOVE_MAX;
}

export class FixedTableShippingProvider implements ShippingProvider {
  async quote(req: QuoteRequest): Promise<ShippingQuote[]> {
    const db = getDB();
    const totalGrams = req.packages.reduce((sum, p) => sum + p.weightGrams * p.quantity, 0) || 1;

    // Enquanto não tem carrier cadastrado na aba "Transportadoras", cai num
    // carrier sintético — o checkout não fica travado esperando cadastro.
    const carriersRes = await db.query(`SELECT id, name FROM carriers WHERE active = true ORDER BY name ASC`);
    const carriers: { id: number | null; name: string }[] =
      carriersRes.rows.length > 0 ? carriersRes.rows : [{ id: null, name: "Frete Padrão" }];

    const base = basePriceForWeight(totalGrams);

    return Promise.all(
      carriers.map(async (carrier) => ({
        carrierId: carrier.id,
        carrierName: carrier.name,
        serviceName: "Padrão",
        price: await applyShippingMarkup(base),
        etaDays: STANDARD_ETA_DAYS,
      }))
    );
  }
}
