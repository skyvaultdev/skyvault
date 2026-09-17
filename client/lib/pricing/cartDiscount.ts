// Regras de desconto progressivo por subtotal ("compre mais, ganhe mais")
// e frete grátis — puro (sem DB/rede) de propósito: usado tanto no
// servidor (create-order, autoridade sobre o valor cobrado) quanto no
// client (barra de progresso do checkout) sem duplicar a regra. Os valores
// em si (degraus, limiar de frete grátis) vêm de store_promotion_settings,
// configurados pelo dono na aba Geral — não são mais constantes fixas.
export type DiscountTier = { minSubtotal: number; percent: number };

export type PromotionSettings = {
  discountTiers: DiscountTier[];
  freeShippingEnabled: boolean;
  freeShippingThreshold: number;
  minOrderValue: number;
};

// Desligado por padrão de propósito — uma loja nova, que nunca abriu a aba
// Geral, não deve sair aplicando desconto/frete grátis sozinha. Só vira
// realidade depois que o dono configura e salva.
export const DEFAULT_PROMOTION_SETTINGS: PromotionSettings = {
  discountTiers: [],
  freeShippingEnabled: false,
  freeShippingThreshold: 150,
  minOrderValue: 0,
};

function sortedTiersDesc(tiers: DiscountTier[]): DiscountTier[] {
  return [...tiers].sort((a, b) => b.minSubtotal - a.minSubtotal);
}

export function getDiscountPercent(subtotal: number, tiers: DiscountTier[]): number {
  const tier = sortedTiersDesc(tiers).find((t) => subtotal >= t.minSubtotal);
  return tier?.percent ?? 0;
}

export function getDiscountAmount(subtotal: number, tiers: DiscountTier[]): number {
  return Math.round(subtotal * (getDiscountPercent(subtotal, tiers) / 100) * 100) / 100;
}

export function qualifiesForFreeShipping(subtotal: number, settings: PromotionSettings): boolean {
  return settings.freeShippingEnabled && subtotal >= settings.freeShippingThreshold;
}

// Próximo degrau ainda não alcançado (desconto maior, ou frete grátis se
// isso vier primeiro) — usado pra montar "faltam R$X pra Y" no checkout.
export function getNextMilestone(subtotal: number, settings: PromotionSettings): { amountNeeded: number; label: string } | null {
  const milestones = [
    ...(settings.freeShippingEnabled ? [{ threshold: settings.freeShippingThreshold, label: "frete grátis" }] : []),
    ...settings.discountTiers.map((t) => ({ threshold: t.minSubtotal, label: `${t.percent}% de desconto` })),
  ]
    .filter((m) => m.threshold > subtotal)
    .sort((a, b) => a.threshold - b.threshold);

  const next = milestones[0];
  if (!next) return null;

  return {
    amountNeeded: Math.round((next.threshold - subtotal) * 100) / 100,
    label: next.label,
  };
}
