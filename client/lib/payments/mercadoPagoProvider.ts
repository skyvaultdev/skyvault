import { MercadoPagoConfig, Payment } from "mercadopago";
import { config } from "@/config/configuration";
import { loadMercadoPagoCredentials } from "./mercadoPagoCredentials";
import type { PaymentProvider, ChargeRequest, ChargeResult } from "./PaymentProvider";

// Tradução dos motivos de recusa mais comuns do Mercado Pago
// (status_detail) pra uma mensagem que o cliente entende — sem isso ele só
// via "pagamento recusado" sem saber se é saldo, CVV errado, ou precisa
// ligar pro banco. Lista não exaustiva (cobre os motivos mais frequentes);
// o que não está mapeado cai num texto genérico.
const REJECTION_REASONS: Record<string, string> = {
  cc_rejected_insufficient_amount: "Saldo insuficiente no cartão.",
  cc_rejected_bad_filled_security_code: "Código de segurança (CVV) inválido.",
  cc_rejected_bad_filled_date: "Data de validade do cartão inválida.",
  cc_rejected_bad_filled_card_number: "Número do cartão inválido.",
  cc_rejected_bad_filled_other: "Dados do cartão inválidos.",
  cc_rejected_call_for_authorize: "O cartão precisa de autorização — contate seu banco.",
  cc_rejected_card_disabled: "Cartão desabilitado — contate seu banco.",
  cc_rejected_duplicated_payment: "Já existe um pagamento igual em processamento.",
  cc_rejected_high_risk: "Pagamento recusado por segurança. Tente outro cartão.",
  cc_rejected_max_attempts: "Muitas tentativas com esse cartão. Tente outro.",
  cc_rejected_invalid_installments: "Número de parcelas inválido pra esse cartão.",
  cc_rejected_other_reason: "Recusado pelo banco emissor. Tente outro cartão.",
};

function translateRejection(statusDetail: string | undefined): string | undefined {
  if (!statusDetail) return undefined;
  return REJECTION_REASONS[statusDetail] ?? "Pagamento recusado pelo banco emissor. Tente outro cartão ou método.";
}

// Integração real com o SDK v2 do Mercado Pago (`mercadopago` no npm) e o
// Payment Brick. O onSubmit do Brick já devolve o payload pronto pro
// formato da API de pagamentos (token de cartão, payment_method_id,
// parcelas, CPF...) — repasso quase sem alteração em vez de tentar
// reconstruir campo por campo.
export class MercadoPagoProvider implements PaymentProvider {
  readonly name = "mercadopago" as const;

  async createCharge(req: ChargeRequest): Promise<ChargeResult> {
    const creds = await loadMercadoPagoCredentials();
    if (!creds) {
      throw new Error("Mercado Pago não configurado — defina MERCADO_PAGO_ACCESS_TOKEN e MERCADO_PAGO_PUBLIC_KEY no .env do servidor.");
    }

    const client = new MercadoPagoConfig({ accessToken: creds.accessToken });
    const payment = new Payment(client);

    const result = await payment.create({
      body: {
        ...req.brickFormData,
        transaction_amount: req.amount,
        description: `Pedido #${req.orderId}`,
        external_reference: String(req.orderId),
        notification_url: `${config.WEBSITE_URL}/api/webhooks/mercadopago`,
      },
      requestOptions: { idempotencyKey: req.idempotencyKey },
    });

    const status: ChargeResult["status"] =
      result.status === "approved" ? "paid" : result.status === "rejected" ? "failed" : "pending";

    return {
      providerTxid: String(result.id),
      status,
      failureReason: status === "failed" ? translateRejection(result.status_detail) : undefined,
      pixCopyPaste: result.point_of_interaction?.transaction_data?.qr_code,
      pixQrCodeBase64: result.point_of_interaction?.transaction_data?.qr_code_base64,
      boletoUrl: result.transaction_details?.external_resource_url ?? undefined,
      boletoBarcode: (result as any).barcode?.content,
      raw: result,
    };
  }
}

// Chamado pelo webhook — nunca confia no payload que o Mercado Pago manda
// sozinho, sempre confirma direto com nossas próprias credenciais antes de
// liberar qualquer coisa.
export async function getMercadoPagoPaymentStatus(paymentId: string): Promise<{ paid: boolean; raw: unknown }> {
  const creds = await loadMercadoPagoCredentials();
  if (!creds) throw new Error("Mercado Pago não configurado.");

  const client = new MercadoPagoConfig({ accessToken: creds.accessToken });
  const payment = new Payment(client);
  const result = await payment.get({ id: paymentId });

  return { paid: result.status === "approved", raw: result };
}

// Chamado só pela dashboard /dev, em modo leitura — confirma que a
// credencial salva pela loja realmente autentica contra o Mercado Pago,
// sem nunca expor o token pros devs.
export async function testMercadoPagoConnection(): Promise<{ ok: boolean; accountEmail?: string; error?: string }> {
  const creds = await loadMercadoPagoCredentials();
  if (!creds) return { ok: false, error: "NOT_CONFIGURED" };

  try {
    const res = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    if (!res.ok) return { ok: false, error: `HTTP_${res.status}` };
    const data = await res.json();
    return { ok: true, accountEmail: data.email };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "UNKNOWN_ERROR" };
  }
}
