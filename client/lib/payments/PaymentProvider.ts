export type PaymentMethod = "pix" | "credit_card" | "boleto";

export type ChargeRequest = {
  orderId: number;
  amount: number;
  method: PaymentMethod;
  idempotencyKey: string;
  customerEmail: string;
};

export type ChargeResult = {
  providerTxid: string;
  status: "created" | "pending" | "paid";
  // Pix: código copia-e-cola / payload do QR code. Ausente pra outros métodos.
  pixCopyPaste?: string;
  raw: unknown;
};

// Interface única pro gateway de pagamento — o seletor em index.ts escolhe
// entre mock e EfiBank de verdade dependendo se o dono da loja já
// cadastrou as credenciais dele na aba Configurações.
export interface PaymentProvider {
  readonly name: "mock" | "efibank";
  createCharge(req: ChargeRequest): Promise<ChargeResult>;
}
