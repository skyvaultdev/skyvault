import crypto from "crypto";
import type { ChargeRequest, ChargeResult, PaymentProvider } from "./PaymentProvider";

// Provider de teste — não fala com nenhum gateway real. Gera um "txid" e um
// código pix falso na hora, deixando o pedido em status "pending" até
// alguém chamar /api/checkout/mock-confirm-payment (equivalente a simular
// o webhook que a EfiBank mandaria quando o pagamento real cai).
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;

  async createCharge(req: ChargeRequest): Promise<ChargeResult> {
    const providerTxid = `mock_${crypto.randomUUID()}`;

    return {
      providerTxid,
      status: "pending",
      pixCopyPaste: req.method === "pix" ? `00020126MOCKPIX${providerTxid}5204000053039865802BR` : undefined,
      raw: { mock: true, orderId: req.orderId, amount: req.amount, method: req.method },
    };
  }
}
