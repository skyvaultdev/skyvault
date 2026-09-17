"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import "./orders.css";
import BrazilMap from "@/app/(components)/shipping/BrazilMap";
import { useModal } from "@/app/(components)/modal/ModalProvider";

type OrderRow = {
  id: number;
  order_number: string | null;
  status: string;
  total: number;
  created_at: string;
  paid_at: string | null;
  item_count: number;
  has_physical: boolean;
  thumbnail_url: string | null;
  shipment_status: string | null;
  tracking_code: string | null;
};

// Mesma regra usada na criação do pedido (lib/orders/orderNumber.ts), mas
// reimplementada aqui pra não puxar lib/database/db (pg) pro bundle do
// client — aquele módulo é server-only.
function displayOrderNumber(order: { order_number?: string | null; id: number }) {
  return order.order_number || `LEGADO-${order.id}`;
}

type OrderItem = {
  id: number;
  product_name: string;
  variation_name: string | null;
  quantity: number;
  unit_price: number;
  product_type: "digital" | "physical";
  image_url: string | null;
  category_name: string | null;
  deliveredContent: string[] | null;
};

type ShipmentEvent = {
  id: number;
  status: string;
  city: string | null;
  state: string | null;
  description: string | null;
  created_at: string;
};

type TicketMessage = {
  id: number;
  sender_type: "customer" | "staff";
  sender_email: string;
  body: string;
  created_at: string;
};

type OrderDetail = {
  id: number;
  order_number: string | null;
  status: string;
  total: number;
  created_at: string;
  items: OrderItem[];
  shippingAddress: {
    recipient_name: string; street: string; number: string; complement: string | null;
    neighborhood: string; city: string; state: string; cep: string;
  } | null;
  shipment: { id: number; status: string; tracking_code: string | null; carrier_name: string | null } | null;
  shipmentEvents: ShipmentEvent[];
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  paid: "Pago",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const SHIPMENT_STEPS = [
  { value: "preparing", label: "Preparando", icon: "📦" },
  { value: "posted", label: "Postado", icon: "🚚" },
  { value: "in_transit", label: "Em trânsito", icon: "🛣️" },
  { value: "delivered", label: "Entregue", icon: "🏠" },
];

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  preparing: "Preparando envio",
  posted: "Postado",
  in_transit: "Em trânsito",
  delivered: "Entregue",
  returned: "Devolvido",
  cancelled: "Cancelado",
};

export default function OrdersPage() {
  const router = useRouter();
  const modal = useModal();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const ORDERS_PAGE_SIZE = 10;
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [confirmingDelivery, setConfirmingDelivery] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [copiedTracking, setCopiedTracking] = useState(false);

  const [ticketConversationId, setTicketConversationId] = useState<number | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [ticketStatusValue, setTicketStatusValue] = useState<"open" | "closed" | null>(null);
  const [ticketOpening, setTicketOpening] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [ticketDraft, setTicketDraft] = useState("");
  const [ticketSending, setTicketSending] = useState(false);

  const loadOrders = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders?page=${page}&pageSize=${ORDERS_PAGE_SIZE}`, { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const json = await res.json();
      if (res.ok && json.data && Array.isArray(json.data.items)) {
        setOrders(json.data.items);
        setOrdersTotal(json.data.total ?? 0);
        setOrdersPage(json.data.page ?? page);
      } else {
        setOrders([]);
        setOrdersTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadOrders(1);
  }, [loadOrders]);

  const ordersTotalPages = Math.max(1, Math.ceil(ordersTotal / ORDERS_PAGE_SIZE));

  async function openOrder(id: number) {
    setLoadingDetail(true);
    setSelectedOrder(null);
    setDetailError("");
    setTicketConversationId(null);
    setTicketMessages([]);
    setTicketStatusValue(null);
    setTicketError("");
    setTicketDraft("");
    try {
      const res = await fetch(`/api/checkout/order/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setSelectedOrder(json.data);
        // Se já existe um ticket (aberto ou encerrado) pra esse pedido, o
        // chat carrega sozinho — antes só aparecia o botão "abrir ticket"
        // de novo, mesmo já tendo uma conversa (e clicar nele criaria um
        // ticket novo em vez de mostrar o antigo, se estivesse encerrado).
        void checkExistingTicket(id);
      } else {
        setDetailError("Não foi possível carregar esse pedido. Tente novamente.");
      }
    } catch {
      setDetailError("Não foi possível carregar esse pedido. Tente novamente.");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function checkExistingTicket(orderId: number) {
    try {
      const res = await fetch(`/api/chat/tickets?orderId=${orderId}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data?.conversationId) {
        setTicketConversationId(json.data.conversationId);
        await loadTicketMessages(json.data.conversationId);
      }
    } catch {
      // se falhar, o cliente ainda pode clicar em "abrir ticket" manualmente
    }
  }

  function closeOrderModal() {
    setSelectedOrder(null);
    setDetailError("");
    setTicketConversationId(null);
    setTicketMessages([]);
    setTicketStatusValue(null);
    setTicketError("");
    setTicketDraft("");
  }

  async function confirmDelivery() {
    if (!selectedOrder) return;
    if (!(await modal.confirm("Confirma que recebeu esse pedido?"))) return;
    setConfirmingDelivery(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/confirm-delivery`, { method: "PATCH" });
      if (res.ok) {
        await openOrder(selectedOrder.id);
        await loadOrders(ordersPage);
      } else {
        setDetailError("Não foi possível confirmar a entrega. Tente novamente em instantes.");
      }
    } catch {
      setDetailError("Não foi possível confirmar a entrega. Tente novamente em instantes.");
    } finally {
      setConfirmingDelivery(false);
    }
  }

  function copyTrackingCode() {
    if (!selectedOrder?.shipment?.tracking_code) return;
    navigator.clipboard?.writeText(selectedOrder.shipment.tracking_code).then(() => {
      setCopiedTracking(true);
      setTimeout(() => setCopiedTracking(false), 2000);
    }).catch(() => {});
  }

  async function loadTicketMessages(conversationId: number) {
    try {
      const res = await fetch(`/api/chat/tickets/${conversationId}/messages`, { cache: "no-store" });
      if (!res.ok) {
        setTicketError("Não foi possível carregar as mensagens do ticket.");
        return;
      }
      const json = await res.json();
      setTicketMessages(Array.isArray(json.data) ? json.data : []);
      setTicketStatusValue(json.status ?? null);
    } catch {
      setTicketError("Não foi possível carregar as mensagens do ticket.");
    }
  }

  async function openTicket() {
    if (!selectedOrder) return;
    setTicketOpening(true);
    setTicketError("");
    try {
      const res = await fetch("/api/chat/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selectedOrder.id }),
      });
      const json = await res.json();
      if (res.ok && json?.data?.conversationId) {
        const conversationId = json.data.conversationId as number;
        setTicketConversationId(conversationId);
        await loadTicketMessages(conversationId);
      } else {
        setTicketError(
          json?.error === "ORDER_NOT_FOUND"
            ? "Não conseguimos vincular esse pedido a você. Atualize a página e tente de novo."
            : "Não foi possível abrir o ticket agora. Tente novamente em instantes."
        );
      }
    } catch {
      setTicketError("Não foi possível abrir o ticket agora. Verifique sua conexão e tente de novo.");
    } finally {
      setTicketOpening(false);
    }
  }

  async function sendTicketMessage() {
    if (!ticketConversationId || !ticketDraft.trim()) return;
    setTicketSending(true);
    setTicketError("");
    try {
      const res = await fetch(`/api/chat/tickets/${ticketConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: ticketDraft.trim() }),
      });
      if (res.ok) {
        setTicketDraft("");
        await loadTicketMessages(ticketConversationId);
      } else {
        setTicketError("Não foi possível enviar a mensagem. Tente novamente.");
      }
    } catch {
      setTicketError("Não foi possível enviar a mensagem. Verifique sua conexão.");
    } finally {
      setTicketSending(false);
    }
  }

  useEffect(() => {
    if (!ticketConversationId) return;
    const interval = setInterval(() => void loadTicketMessages(ticketConversationId), 8000);
    return () => clearInterval(interval);
  }, [ticketConversationId]);

  const lastEvent = selectedOrder?.shipmentEvents.length
    ? selectedOrder.shipmentEvents[selectedOrder.shipmentEvents.length - 1]
    : null;

  const shipmentStepIndex = selectedOrder?.shipment
    ? SHIPMENT_STEPS.findIndex((s) => s.value === selectedOrder.shipment!.status)
    : -1;
  const shipmentIsEndState = selectedOrder?.shipment
    ? selectedOrder.shipment.status === "returned" || selectedOrder.shipment.status === "cancelled"
    : false;
  const canConfirmDelivery =
    selectedOrder?.shipment && (selectedOrder.shipment.status === "posted" || selectedOrder.shipment.status === "in_transit");

  return (
    <main className="ordersPage">
      <div className="ordersPageCard">
        <h1>Meus pedidos</h1>
        <p className="ordersHint">Histórico de compras, entregas digitais e rastreio de pedidos físicos.</p>

        {loading && <p>Carregando...</p>}
        {!loading && orders.length === 0 && <p className="ordersEmpty">Você ainda não fez nenhum pedido.</p>}

        <div className="ordersPageList">
          {orders.map((order) => (
            <button key={order.id} className="ordersPageRow" onClick={() => openOrder(order.id)}>
              <img src={order.thumbnail_url || "/file.svg"} alt="" className="ordersPageRowThumb" />
              <div className="ordersPageRowBody">
                <div className="ordersPageRowTop">
                  <span className="ordersPageRowId">{displayOrderNumber(order)}</span>
                  <span className={`ordersPageStatus status-${order.status}`}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </div>
                <div className="ordersPageRowBottom">
                  {order.has_physical && order.shipment_status && (
                    <span className="ordersPageShipmentBadge">
                      📦 {SHIPMENT_STATUS_LABELS[order.shipment_status] ?? order.shipment_status}
                    </span>
                  )}
                  <span className="ordersPageItemCount">{order.item_count} item(ns)</span>
                  <span className="ordersPageTotal">
                    R$ {Number(order.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                  <span className="ordersPageDate">{new Date(order.created_at).toLocaleDateString("pt-BR")}</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {!loading && ordersTotal > ORDERS_PAGE_SIZE && (
          <div className="ordersPagePagination">
            <button
              className="ordersPagePaginationBtn"
              disabled={ordersPage <= 1}
              onClick={() => loadOrders(ordersPage - 1)}
            >
              ← Anterior
            </button>
            <span className="ordersPagePaginationInfo">
              Página {ordersPage} de {ordersTotalPages}
            </span>
            <button
              className="ordersPagePaginationBtn"
              disabled={ordersPage >= ordersTotalPages}
              onClick={() => loadOrders(ordersPage + 1)}
            >
              Próxima →
            </button>
          </div>
        )}
      </div>

      {(loadingDetail || selectedOrder) && (
        <div className="modalOverlay" onClick={closeOrderModal}>
          <div className="modalContent orderDetailModal" onClick={(e) => e.stopPropagation()}>
            {loadingDetail && <p>Carregando pedido...</p>}
            {detailError && !selectedOrder && <p className="ordersErrorBanner">{detailError}</p>}
            {selectedOrder && (
              <>
                <div className="ordersDetailHeader">
                  <h4>Pedido {displayOrderNumber(selectedOrder)}</h4>
                  <span className={`ordersPageStatus status-${selectedOrder.status}`}>
                    {STATUS_LABELS[selectedOrder.status] ?? selectedOrder.status}
                  </span>
                </div>

                {detailError && <p className="ordersErrorBanner">{detailError}</p>}

                {selectedOrder.shipment && (
                  <div className="sheinShipmentCard">
                    <div className="sheinStepper">
                      {SHIPMENT_STEPS.map((step, idx) => {
                        const done = !shipmentIsEndState && shipmentStepIndex >= 0 && idx <= shipmentStepIndex;
                        const active = !shipmentIsEndState && idx === shipmentStepIndex;
                        return (
                          <div key={step.value} className={`sheinStep ${done ? "done" : ""} ${active ? "active" : ""}`}>
                            <span className="sheinStepIcon">{step.icon}</span>
                            <span className="sheinStepLabel">{step.label}</span>
                            {idx < SHIPMENT_STEPS.length - 1 && <span className="sheinStepLine" />}
                          </div>
                        );
                      })}
                    </div>

                    {shipmentIsEndState && (
                      <p className={`sheinEndStateBanner ${selectedOrder.shipment.status}`}>
                        {selectedOrder.shipment.status === "cancelled" ? "❌ Envio cancelado" : "↩️ Devolvido ao remetente"}
                      </p>
                    )}

                    {selectedOrder.shipment.tracking_code && (
                      <button type="button" className="sheinTrackingCode" onClick={copyTrackingCode}>
                        <span>Rastreio: <strong>{selectedOrder.shipment.tracking_code}</strong></span>
                        <span className="sheinCopyHint">{copiedTracking ? "Copiado!" : "Copiar"}</span>
                      </button>
                    )}

                    <BrazilMap state={lastEvent?.state ?? null} city={lastEvent?.city ?? null} />

                    <div className="shipmentTimeline">
                      {selectedOrder.shipmentEvents.slice().reverse().map((event) => (
                        <div key={event.id} className="shipmentTimelineItem">
                          <span className="shipmentTimelineDot" />
                          <div>
                            <strong>{SHIPMENT_STATUS_LABELS[event.status] ?? event.status}</strong>
                            {(event.city || event.state) && (
                              <span className="ordersHint"> — {[event.city, event.state].filter(Boolean).join(", ")}</span>
                            )}
                            {event.description && <p className="ordersHint">{event.description}</p>}
                            <p className="shipmentTimelineDate">
                              {new Date(event.created_at).toLocaleString("pt-BR")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {canConfirmDelivery && (
                      <button className="sheinConfirmBtn" onClick={confirmDelivery} disabled={confirmingDelivery}>
                        {confirmingDelivery ? "Confirmando..." : "📦 Recebi meu pedido"}
                      </button>
                    )}
                  </div>
                )}

                <div className="orderDetailItems">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="ordersItemRich">
                      <img src={item.image_url || "/file.svg"} alt={item.product_name} className="ordersItemThumb" />
                      <div className="ordersItemInfo">
                        <span className="ordersItemName">
                          {item.product_name}{item.variation_name ? ` — ${item.variation_name}` : ""}
                        </span>
                        <span className="ordersItemMeta">
                          {item.category_name ?? "Sem categoria"} · {item.product_type === "physical" ? "📦 Físico" : "💾 Digital"} · Qtd {item.quantity}
                        </span>
                        {item.deliveredContent && item.deliveredContent.length > 0 && (
                          <div className="deliveredList">
                            {item.deliveredContent.map((content, i) =>
                              content.startsWith("/api/files/") ? (
                                <a key={i} href={content} target="_blank" rel="noreferrer" className="ordersDeliveredLink">
                                  Baixar arquivo
                                </a>
                              ) : (
                                <code key={i}>{content}</code>
                              )
                            )}
                          </div>
                        )}
                      </div>
                      <span className="ordersItemPrice">
                        R$ {(Number(item.unit_price) * item.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="ordersTicketBox">
                  <p className="ordersTicketPrompt">Precisa de ajuda com esse pedido?</p>

                  {ticketError && <p className="ordersErrorBanner">{ticketError}</p>}

                  {!ticketConversationId && (
                    <button className="ordersTicketOpenBtn" onClick={openTicket} disabled={ticketOpening}>
                      {ticketOpening ? "Abrindo..." : "💬 Abrir ticket de suporte"}
                    </button>
                  )}

                  {ticketConversationId && (
                    <div className="ordersTicketThread">
                      <div className="ordersTicketHeader">
                        <strong>Suporte — Pedido {displayOrderNumber(selectedOrder)}</strong>
                        {ticketStatusValue === "closed" && <span className="ordersTicketClosedTag">Encerrado</span>}
                      </div>

                      <div className="ordersTicketMessages">
                        {ticketMessages.length === 0 && (
                          <p className="ordersHint">Descreva o problema abaixo — o suporte vai te responder por aqui.</p>
                        )}
                        {ticketMessages.map((m) => (
                          <div key={m.id} className={`ordersTicketMsg ${m.sender_type === "customer" ? "own" : "other"}`}>
                            {m.body}
                          </div>
                        ))}
                      </div>

                      {ticketStatusValue === "open" ? (
                        <div className="ordersTicketComposer">
                          <input
                            value={ticketDraft}
                            onChange={(e) => setTicketDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void sendTicketMessage(); }}
                            placeholder="Digite sua mensagem..."
                            className="ordersTicketInput"
                          />
                          <button className="ordersBtnSecondary" onClick={sendTicketMessage} disabled={ticketSending || !ticketDraft.trim()}>
                            {ticketSending ? "Enviando..." : "Enviar"}
                          </button>
                        </div>
                      ) : (
                        <p className="ordersHint">Esse ticket já foi encerrado pelo suporte.</p>
                      )}
                    </div>
                  )}
                </div>

                <button className="ordersBtnSecondary" onClick={closeOrderModal}>Fechar</button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
