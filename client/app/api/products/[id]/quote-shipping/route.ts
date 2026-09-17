"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { getShippingProvider } from "@/lib/shipping";

type Params = { params: Promise<{ id: string }> };

// Cotação avulsa de UM produto (ou variação), sem depender do carrinho —
// usada na própria página do produto pra mostrar prazo/preço antes do
// cliente decidir comprar. Mesma lógica de pacote de
// checkout/quote-shipping/route.ts, só que a partir de um product_id/slug
// direto em vez de somar os itens do carrinho.
export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const isNumeric = /^\d+$/.test(id);

    const { cep, variationId } = await req.json();
    const cepDigits = String(cep ?? "").replace(/\D/g, "");
    if (cepDigits.length !== 8) return fail("INVALID_CEP", 400);

    const db = getDB();
    const productRes = await db.query(
      `SELECT id, product_type, weight_grams, length_cm, width_cm, height_cm
       FROM products WHERE ${isNumeric ? "id = $1" : "slug = $1"}`,
      [isNumeric ? Number(id) : id]
    );
    if (productRes.rows.length === 0) return fail("NOT_FOUND", 404);
    const product = productRes.rows[0];

    if (product.product_type !== "physical") return fail("NOT_PHYSICAL", 400);

    let dims = {
      weightGrams: Number(product.weight_grams) || 300,
      lengthCm: Number(product.length_cm) || 16,
      widthCm: Number(product.width_cm) || 12,
      heightCm: Number(product.height_cm) || 4,
    };

    if (variationId) {
      const variationRes = await db.query(
        `SELECT weight_grams, length_cm, width_cm, height_cm
         FROM product_variations WHERE id = $1 AND product_id = $2`,
        [Number(variationId), product.id]
      );
      const v = variationRes.rows[0];
      if (v) {
        dims = {
          weightGrams: Number(v.weight_grams) || dims.weightGrams,
          lengthCm: Number(v.length_cm) || dims.lengthCm,
          widthCm: Number(v.width_cm) || dims.widthCm,
          heightCm: Number(v.height_cm) || dims.heightCm,
        };
      }
    }

    const originRes = await db.query(`SELECT origin_cep FROM store_settings ORDER BY id DESC LIMIT 1`);
    const originCep = originRes.rows[0]?.origin_cep ?? "";

    const provider = await getShippingProvider();
    const quotes = await provider.quote({
      originCep,
      destinationCep: cepDigits,
      packages: [{ ...dims, quantity: 1 }],
    });

    return ok(quotes);
  } catch (error) {
    if (error instanceof Error && error.message === "SHIPPING_ORIGIN_NOT_CONFIGURED") {
      return fail("SHIPPING_ORIGIN_NOT_CONFIGURED", 409);
    }
    console.error("Erro ao cotar frete do produto:", error);
    return fail("SHIPPING_QUOTE_ERROR", 500);
  }
}
