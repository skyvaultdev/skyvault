"use server";

import { fail, ok } from "@/lib/api/response";
import { getSession } from "@/lib/jwt/session";
import { getPublicProduct } from "@/lib/products/getPublicProduct";

type Params = { params: Promise<{ id: string }> };

// Rota pública (produto na loja) e também reaproveitada por telas internas
// (edição, gerência de estoque, prévia) — por isso NUNCA devolve
// stock_content/stock_type (é literalmente o que o cliente compra) nem
// store_id, e só mostra produto inativo pra quem tem products.read. A
// query em si vive em lib/products/getPublicProduct.ts, reaproveitada
// também pelo Server Component de app/(public)/product/[slug]/page.tsx.
export async function GET(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    const canSeeInactive = !!session?.permissions?.includes("products.read");

    const product = await getPublicProduct(id, canSeeInactive);
    if (!product) return fail("NOT_FOUND", 404);

    return ok(product);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
