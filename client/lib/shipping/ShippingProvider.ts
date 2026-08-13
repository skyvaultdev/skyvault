export type PackageInfo = {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  quantity: number;
};

export type ShippingQuote = {
  carrierId: number | null;
  carrierName: string;
  serviceName: string;
  price: number;
  etaDays: number;
};

export type QuoteRequest = {
  originCep: string;
  destinationCep: string;
  packages: PackageInfo[];
};

// Interface única de frete — hoje só a tabela fixa configurável roda de
// fato; Correios direto ou um agregador (Melhor Envio/Frenet) entram
// atrás dela depois que decidirem qual (ver plano), sem mexer no checkout.
export interface ShippingProvider {
  quote(req: QuoteRequest): Promise<ShippingQuote[]>;
}
