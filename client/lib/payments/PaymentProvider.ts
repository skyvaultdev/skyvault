export type PaymentMethod = "pix" | "credit_card" | "debit_card" | "boleto";

export type ChargeRequest = {
  orderId: number;
  amount: number;
  method: PaymentMethod;
  idempotencyKey: string;
  customerEmail: string;
  // Payload cru devolvido pelo Payment Brick do Mercado Pago no onSubmit —
  // já vem no formato que a API de pagamentos deles espera (token de
  // cartão, payment_method_id, parcelas, CPF do pagador etc). Repassar
  // quase sem alteração evita reimplementar campo por campo aqui.
  brickFormData?: Record<string, unknown>;
};

export type ChargeResult = {
  providerTxid: string;
  status: "created" | "pending" | "paid" | "failed";
  // Motivo legível (em pt-BR) de uma recusa — só preenchido quando
  // status === "failed" e o provider consegue traduzir o motivo (ex:
  // status_detail do Mercado Pago). Mostrado direto pro cliente, então
  // nunca deve vazar detalhe técnico cru.
  failureReason?: string;
  pixCopyPaste?: string;
  pixQrCodeBase64?: string;
  boletoUrl?: string;
  boletoBarcode?: string;
  raw: unknown;
};

// Interface única pro gateway de pagamento — hoje só o mock roda de fato;
// o Mercado Pago fica atrás dela, com credenciais do dono da loja
// configuradas no .env do servidor (MERCADO_PAGO_ACCESS_TOKEN/PUBLIC_KEY),
// não pelos devs — quem recebe o dinheiro é ele.
export interface PaymentProvider {
  readonly name: "mock" | "mercadopago";
  createCharge(req: ChargeRequest): Promise<ChargeResult>;
}
