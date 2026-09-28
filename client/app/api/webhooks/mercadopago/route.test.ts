import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Simula o webhook do Mercado Pago sem bater no banco/API real — só a
// LÓGICA do handler é testada aqui (roteamento de decisões, idempotência,
// tratamento de erro na entrega). A cobertura de ponta a ponta contra o
// banco real (baixa de estoque, geração de item entregue) vive em
// lib/payments/confirmOrderPayment.test.ts.

const queryMock = vi.fn();
vi.mock("@/lib/database/db", () => ({
  getDB: () => ({ query: queryMock }),
}));

const isMercadoPagoConfiguredMock = vi.fn();
const loadMercadoPagoCredentialsMock = vi.fn();
vi.mock("@/lib/payments/mercadoPagoCredentials", () => ({
  isMercadoPagoConfigured: () => isMercadoPagoConfiguredMock(),
  loadMercadoPagoCredentials: () => loadMercadoPagoCredentialsMock(),
}));

const getMercadoPagoPaymentStatusMock = vi.fn();
vi.mock("@/lib/payments/mercadoPagoProvider", () => ({
  getMercadoPagoPaymentStatus: (id: string) => getMercadoPagoPaymentStatusMock(id),
}));

const confirmOrderPaymentMock = vi.fn();
vi.mock("@/lib/payments/confirmOrderPayment", () => ({
  confirmOrderPayment: (orderId: number) => confirmOrderPaymentMock(orderId),
}));

const sendOrderDeliveryEmailMock = vi.fn();
vi.mock("@/lib/mail/sendOrderDeliveryEmail", () => ({
  sendOrderDeliveryEmail: (args: unknown) => sendOrderDeliveryEmailMock(args),
}));

// Sem isso os testes competiriam pelo mesmo Map em memória do rate limiter
// de verdade (chave "unknown", já que a Request de teste não tem
// x-forwarded-for) — mocka pra manter os testes isolados uns dos outros.
vi.mock("@/lib/security/rateLimit", () => ({
  rateLimit: () => true,
}));

const { POST } = await import("./route");

function webhookRequest(dataId: string | null) {
  return new Request("https://example.com/api/webhooks/mercadopago", {
    method: "POST",
    body: JSON.stringify(dataId ? { type: "payment", data: { id: dataId } } : {}),
  });
}

// Confirmado ao vivo: o Mercado Pago também manda o id como query string,
// não só no corpo — formato novo (?data.id=X&type=payment) e formato
// antigo/IPN (?id=X&topic=payment), quase sempre com o corpo vazio.
function webhookQueryRequest(query: string) {
  return new Request(`https://example.com/api/webhooks/mercadopago?${query}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// Reproduz o formato de assinatura documentado pelo Mercado Pago, pra
// testar o caminho bloqueante de verdade (não só com webhookSecret null).
function signedWebhookRequest(dataId: string, secret: string, options?: { tamperSignature?: boolean }) {
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = "req-abc-123";
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = options?.tamperSignature
    ? "0".repeat(64)
    : crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  return new Request("https://example.com/api/webhooks/mercadopago", {
    method: "POST",
    headers: { "x-signature": `ts=${ts},v1=${hash}`, "x-request-id": requestId },
    body: JSON.stringify({ type: "payment", data: { id: dataId } }),
  });
}

describe("POST /api/webhooks/mercadopago", () => {
  const ORDER_ID = 42;
  const TXID = "mp-payment-123";

  beforeEach(() => {
    queryMock.mockReset();
    isMercadoPagoConfiguredMock.mockReset().mockResolvedValue(true);
    loadMercadoPagoCredentialsMock.mockReset().mockResolvedValue({ webhookSecret: null });
    getMercadoPagoPaymentStatusMock.mockReset();
    confirmOrderPaymentMock.mockReset();
    sendOrderDeliveryEmailMock.mockReset();
  });

  it("confirma o pagamento aprovado e entrega o produto", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ order_id: ORDER_ID }] }); // lookup por provider_txid
    getMercadoPagoPaymentStatusMock.mockResolvedValue({ paid: true, raw: { status: "approved" } });
    confirmOrderPaymentMock.mockResolvedValue({
      alreadyProcessed: false,
      order: { id: ORDER_ID, status: "delivered", order_number: "ABC123XY" },
      customerEmail: "cliente@teste.com",
      deliveredItems: [{ productName: "Produto Digital", type: "key", content: "KEY-1234" }],
      hasPhysical: false,
      stockShortages: [],
    });

    const res = await POST(webhookRequest(TXID));
    const json = await res.json();

    expect(confirmOrderPaymentMock).toHaveBeenCalledWith(ORDER_ID);
    expect(sendOrderDeliveryEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "cliente@teste.com",
        orderId: ORDER_ID,
        orderNumber: "ABC123XY",
        items: [{ productName: "Produto Digital", type: "key", content: "KEY-1234" }],
      })
    );
    expect(json.ok).toBe(true);
    expect(json.data.received).toBe(true);
  });

  it("não entrega de novo se o webhook disparar mais de uma vez (idempotente)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ order_id: ORDER_ID }] });
    getMercadoPagoPaymentStatusMock.mockResolvedValue({ paid: true, raw: { status: "approved" } });
    confirmOrderPaymentMock.mockResolvedValue({
      alreadyProcessed: true,
      order: { id: ORDER_ID, status: "delivered", order_number: "ABC123XY" },
      customerEmail: "cliente@teste.com",
      deliveredItems: [],
      hasPhysical: false,
      stockShortages: [],
    });

    const res = await POST(webhookRequest(TXID));
    const json = await res.json();

    expect(confirmOrderPaymentMock).toHaveBeenCalledWith(ORDER_ID);
    expect(sendOrderDeliveryEmailMock).not.toHaveBeenCalled();
    expect(json.data.received).toBe(true);
  });

  it("não confirma nem entrega se o Mercado Pago diz que não foi pago", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ order_id: ORDER_ID }] });
    getMercadoPagoPaymentStatusMock.mockResolvedValue({ paid: false, raw: { status: "pending" } });

    const res = await POST(webhookRequest(TXID));
    const json = await res.json();

    expect(confirmOrderPaymentMock).not.toHaveBeenCalled();
    expect(sendOrderDeliveryEmailMock).not.toHaveBeenCalled();
    expect(json.data.received).toBe(true);
  });

  it("lê o id da query string no formato novo (?data.id=X&type=payment), não só do corpo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ order_id: ORDER_ID }] });
    getMercadoPagoPaymentStatusMock.mockResolvedValue({ paid: true, raw: { status: "approved" } });
    confirmOrderPaymentMock.mockResolvedValue({
      alreadyProcessed: false,
      order: { id: ORDER_ID, status: "delivered", order_number: "ABC123XY" },
      customerEmail: "cliente@teste.com",
      deliveredItems: [],
      hasPhysical: false,
      stockShortages: [],
    });

    const res = await POST(webhookQueryRequest(`data.id=${TXID}&type=payment`));
    const json = await res.json();

    expect(getMercadoPagoPaymentStatusMock).toHaveBeenCalledWith(TXID);
    expect(confirmOrderPaymentMock).toHaveBeenCalledWith(ORDER_ID);
    expect(json.data.received).toBe(true);
  });

  it("lê o id da query string no formato antigo/IPN (?id=X&topic=payment)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ order_id: ORDER_ID }] });
    getMercadoPagoPaymentStatusMock.mockResolvedValue({ paid: true, raw: { status: "approved" } });
    confirmOrderPaymentMock.mockResolvedValue({
      alreadyProcessed: false,
      order: { id: ORDER_ID, status: "delivered", order_number: "ABC123XY" },
      customerEmail: "cliente@teste.com",
      deliveredItems: [],
      hasPhysical: false,
      stockShortages: [],
    });

    const res = await POST(webhookQueryRequest(`id=${TXID}&topic=payment`));
    const json = await res.json();

    expect(getMercadoPagoPaymentStatusMock).toHaveBeenCalledWith(TXID);
    expect(confirmOrderPaymentMock).toHaveBeenCalledWith(ORDER_ID);
    expect(json.data.received).toBe(true);
  });

  it("ignora um txid que não corresponde a nenhuma transação nossa", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await POST(webhookRequest("txid-desconhecido"));
    const json = await res.json();

    expect(getMercadoPagoPaymentStatusMock).not.toHaveBeenCalled();
    expect(confirmOrderPaymentMock).not.toHaveBeenCalled();
    expect(json.data.received).toBe(true);
  });

  it("responde erro claro (não silencioso) se a entrega falhar após pagamento aprovado", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ order_id: ORDER_ID }] });
    getMercadoPagoPaymentStatusMock.mockResolvedValue({ paid: true, raw: { status: "approved" } });
    confirmOrderPaymentMock.mockRejectedValue(new Error("DB connection lost"));

    const res = await POST(webhookRequest(TXID));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("DELIVERY_FAILED");
    expect(sendOrderDeliveryEmailMock).not.toHaveBeenCalled();
  });

  it("processa mesmo se a assinatura não confere — nunca pode bloquear um pagamento real (só loga um aviso)", async () => {
    // Confirmado ao vivo em produção: bloquear por assinatura rejeitou
    // notificações LEGÍTIMAS do Mercado Pago (401 em payload real). A
    // segurança de verdade vem do provider_txid bater com uma transação
    // nossa + da confirmação via GET autenticado abaixo, não da assinatura.
    loadMercadoPagoCredentialsMock.mockResolvedValue({ webhookSecret: "shhh-secret" });
    queryMock.mockResolvedValueOnce({ rows: [{ order_id: ORDER_ID }] });
    getMercadoPagoPaymentStatusMock.mockResolvedValue({ paid: true, raw: { status: "approved" } });
    confirmOrderPaymentMock.mockResolvedValue({
      alreadyProcessed: false,
      order: { id: ORDER_ID, status: "delivered", order_number: "ABC123XY" },
      customerEmail: "cliente@teste.com",
      deliveredItems: [],
      hasPhysical: false,
      stockShortages: [],
    });

    const res = await POST(signedWebhookRequest(TXID, "shhh-secret", { tamperSignature: true }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(confirmOrderPaymentMock).toHaveBeenCalledWith(ORDER_ID);
    expect(json.data.received).toBe(true);
  });

  it("processa normalmente quando a assinatura do webhook confere", async () => {
    loadMercadoPagoCredentialsMock.mockResolvedValue({ webhookSecret: "shhh-secret" });
    queryMock.mockResolvedValueOnce({ rows: [{ order_id: ORDER_ID }] });
    getMercadoPagoPaymentStatusMock.mockResolvedValue({ paid: true, raw: { status: "approved" } });
    confirmOrderPaymentMock.mockResolvedValue({
      alreadyProcessed: false,
      order: { id: ORDER_ID, status: "delivered", order_number: "ABC123XY" },
      customerEmail: "cliente@teste.com",
      deliveredItems: [],
      hasPhysical: false,
      stockShortages: [],
    });

    const res = await POST(signedWebhookRequest(TXID, "shhh-secret"));
    const json = await res.json();

    expect(confirmOrderPaymentMock).toHaveBeenCalledWith(ORDER_ID);
    expect(json.data.received).toBe(true);
  });
});
