import crypto from "crypto";
import type { ChargeRequest, ChargeResult, PaymentProvider } from "./PaymentProvider";

// Provider de teste — não fala com nenhum gateway real. Cartão "aprova" na
// hora (imita o comportamento comum do Mercado Pago pra cartão); Pix e
// boleto ficam "pending" até alguém chamar /api/checkout/mock-confirm-payment
// (equivalente a simular o webhook que o Mercado Pago mandaria).
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;

  async createCharge(req: ChargeRequest): Promise<ChargeResult> {
    const providerTxid = `mock_${crypto.randomUUID()}`;

    if (req.method === "credit_card" || req.method === "debit_card") {
      return { providerTxid, status: "paid", raw: { mock: true, orderId: req.orderId, method: req.method } };
    }

    if (req.method === "boleto") {
      return {
        providerTxid,
        status: "pending",
        boletoUrl: "#",
        boletoBarcode: "00190.00009 03040.123456 78901.234567 1 88880000010000",
        raw: { mock: true, orderId: req.orderId, method: req.method },
      };
    }

    return {
      providerTxid,
      status: "pending",
      pixCopyPaste: `00020126MOCKPIX${providerTxid}5204000053039865802BR`,
      raw: { mock: true, orderId: req.orderId, amount: req.amount, method: req.method },
    };
  }
}
