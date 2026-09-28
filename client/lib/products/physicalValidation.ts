// Produto físico sem peso/medidas cai no padrão silencioso de 300g / 16x12x4
// na cotação de frete — cobrando MENOS do que o envio custa de verdade.
// Cadastro/edição agora exigem valores reais e plausíveis.
export function validatePhysicalProduct(input: {
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  stockCount: number;
  stockIsUnlimited: boolean;
}): string | null {
  const { weightGrams, lengthCm, widthCm, heightCm, stockCount, stockIsUnlimited } = input;
  const dims = [lengthCm, widthCm, heightCm];
  if (weightGrams === null || dims.some((d) => d === null)) return "PHYSICAL_DIMENSIONS_REQUIRED";
  if (![weightGrams, ...(dims as number[])].every((n) => Number.isFinite(n) && n > 0)) return "PHYSICAL_DIMENSIONS_INVALID";
  if (weightGrams > 50000 || (dims as number[]).some((d) => d > 200)) return "PHYSICAL_DIMENSIONS_TOO_LARGE";
  if (!stockIsUnlimited && (!Number.isInteger(stockCount) || stockCount < 0)) return "INVALID_STOCK_COUNT";
  return null;
}
