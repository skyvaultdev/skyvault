"use server";

import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { loadPromotionSettings } from "@/lib/pricing/promotionSettings";

// Config de desconto/frete grátis pro checkout calcular a barra de
// progresso do lado do cliente — a autoridade de verdade continua sendo o
// recálculo em create-order, isso aqui só evita hardcodar os degraus no
// front.
export async function GET() {
  try {
    const { denied } = await requireCustomer();
    if (denied) return denied;

    const settings = await loadPromotionSettings();
    return ok(settings);
  } catch (error) {
    console.error("Erro ao buscar configurações de promoção:", error);
    return fail("PROMOTION_SETTINGS_FETCH_ERROR", 500);
  }
}
