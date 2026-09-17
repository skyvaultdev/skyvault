"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import "./OrdersPanel.css";
import { useModal } from "@/app/(components)/modal/ModalProvider";

// Mesma regra de app/lib/orders/orderNumber.ts (displayOrderNumber), mas
// reimplementada aqui pra não puxar lib/database/db (pg) pro bundle do
// client — aquele módulo é server-only.
function displayOrderNumber(order: { order_number?: string | null; id: number }) {
  return order.order_number || `LEGADO-${order.id}`;
}

type OrderRow = {
  id: number;
  order_number: string | null;
  status: string;
  total: number;
  subtotal: number;
  shipping_fee: number;
  created_at: string;
  paid_at: string | null;
  customer_email: string | null;
  item_count: number;
  has_physical: boolean;
  thumbnail_url: string | null;
  shipment_status: string | null;
  tracking_code: string | null;
};

type PendingCart = {
  customer_email: string;
  item_count: number;
  cart_value: number;
  last_updated: string;
  items: Array<{
    productName: string;
    variationName: string | null;
    quantity: number;
    unitPrice: number;
    productType: "digital" | "physical";
  }>;
};

type OrderItemDetail = {
  id: number;
  product_name: string;
  variation_name: string | null;
  quantity: number;
  unit_price: number;
  product_type: "digital" | "physical";
  image_url: string | null;
  category_name: string | null;
  weight_grams: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
};

type ShipmentEvent = {
  id: number;
  status: string;
  city: string | null;
  state: string | null;
  description: string | null;
  created_at: string;
};

type OrderDetail = OrderRow & {
  items: OrderItemDetail[];
  shippingAddress: any | null;
  paymentTransactions: Array<{ id: number; method: string; status: string; provider_txid: string | null; created_at: string }>;
  shipment: { id: number; status: string; tracking_code: string | null; carrier_name: string | null } | null;
  shipmentEvents: ShipmentEvent[];
};

// orders.status só assume esses valores de verdade (mais "cancelled" via
// cancelamento) — "preparing"/"shipped" NÃO são status de pedido, são de
// envio (SHIPMENT_STEPS abaixo). Misturar os dois vocabulários era a causa
// dos emails de envio nunca dispararem antes.
const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  paid: "Pago",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const QUICK_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos" },
  { value: "pending_payment", label: "Aguardando pagamento" },
  { value: "paid", label: "Pago" },
  { value: "delivered", label: "Entregue" },
  { value: "cancelled", label: "Cancelado" },
  { value: "refunded", label: "Reembolsado" },
];

const SHIPMENT_STEPS = [
  { value: "preparing", label: "Preparando" },
  { value: "posted", label: "Postado" },
  { value: "in_transit", label: "Em trânsito" },
  { value: "delivered", label: "Entregue" },
];
const SHIPMENT_END_STATES = [
  { value: "returned", label: "Devolvido" },
  { value: "cancelled", label: "Cancelado" },
];
const SHIPMENT_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  [...SHIPMENT_STEPS, ...SHIPMENT_END_STATES].map((s) => [s.value, s.label])
);

function formatMoney(value: number) {
  return `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function formatWeight(grams: number | null) {
  if (!grams) return null;
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams} g`;
}

export default function OrdersPanel({ canManage }: { canManage: boolean }) {
  const modal = useModal();
  const [view, setView] = useState<"orders" | "carts">("orders");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const ORDERS_PAGE_SIZE = 20;
  const [carts, setCarts] = useState<PendingCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [expandedCart, setExpandedCart] = useState<string | null>(null);
  const [cancellingCart, setCancellingCart] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [trackingCode, setTrackingCode] = useState("");
  const [shipmentStatus, setShipmentStatus] = useState("");
  const [eventCity, setEventCity] = useState("");
  const [eventState, setEventState] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(true);

  const [savingShipment, setSavingShipment] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadOrders = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("pageSize", String(ORDERS_PAGE_SIZE));
      const res = await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" });
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
  }, [search, statusFilter]);

  const loadCarts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pending-carts", { cache: "no-store" });
      const json = await res.json();
      setCarts(res.ok && Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "orders") void loadOrders(1);
    else void loadCarts();
  }, [view, loadOrders, loadCarts]);

  const ordersTotalPages = Math.max(1, Math.ceil(ordersTotal / ORDERS_PAGE_SIZE));

  async function cancelPendingCart(email: string) {
    if (!(await modal.confirm(`Cancelar (esvaziar) o carrinho de ${email}?`))) return;
    setCancellingCart(email);
    try {
      await fetch(`/api/admin/pending-carts?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      await loadCarts();
    } finally {
      setCancellingCart(null);
    }
  }

  async function openOrder(id: number) {
    setLoadingDetail(true);
    setSelectedOrder(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        const data: OrderDetail = json.data;
        setSelectedOrder(data);
        setTrackingCode(data.shipment?.tracking_code || "");
        setShipmentStatus(data.shipment?.status || "preparing");
        setEventCity("");
        setEventState("");
        setEventDescription("");
        setNotifyEmail(true);
        setCancelReason("");
      } else {
        setFeedback({ type: "error", message: "Não foi possível carregar este pedido." });
      }
    } catch {
      setFeedback({ type: "error", message: "Não foi possível carregar este pedido." });
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeOrder() {
    setSelectedOrder(null);
    setFeedback(null);
  }

  const shipmentHasChanges = useMemo(() => {
    if (!selectedOrder?.shipment && shipmentStatus === "preparing" && !trackingCode) return false;
    return (
      shipmentStatus !== (selectedOrder?.shipment?.status || "preparing") ||
      trackingCode.trim() !== (selectedOrder?.shipment?.tracking_code || "") ||
      eventCity.trim() !== "" ||
      eventState.trim() !== "" ||
      eventDescription.trim() !== ""
    );
  }, [selectedOrder, shipmentStatus, trackingCode, eventCity, eventState, eventDescription]);

  async function saveShipment() {
    if (!selectedOrder) return;
    setSavingShipment(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_shipment",
          shipmentStatus,
          trackingCode: trackingCode.trim() || undefined,
          eventCity,
          eventState,
          eventDescription,
          notifyEmail,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error("save_failed");

      await openOrder(selectedOrder.id);
      await loadOrders(ordersPage);
      setFeedback({
        type: "success",
        message: json?.data?.updated === false
          ? "Nada mudou desde o último salvamento."
          : json?.data?.emailSent
            ? "Envio atualizado. Email enviado ao cliente."
            : "Envio atualizado.",
      });
    } catch {
      setFeedback({ type: "error", message: "Não foi possível salvar o envio. Tente novamente." });
    } finally {
      setSavingShipment(false);
    }
  }

  async function setOrderStatus(status: "paid" | "delivered" | "refunded") {
    if (!selectedOrder) return;
    setSavingStatus(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_order_status", status, notifyEmail, reason: cancelReason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error("save_failed");

      await openOrder(selectedOrder.id);
      await loadOrders(ordersPage);
      setFeedback({
        type: "success",
        message: json?.data?.emailSent ? `Status atualizado. Email enviado ao cliente.` : "Status atualizado.",
      });
    } catch {
      setFeedback({ type: "error", message: "Não foi possível atualizar o status." });
    } finally {
      setSavingStatus(false);
    }
  }

  async function cancelOrder() {
    if (!selectedOrder) return;
    if (!(await modal.confirm(`Cancelar o pedido ${displayOrderNumber(selectedOrder)}? Itens físicos voltam pro estoque automaticamente.`, { danger: true }))) return;
    setCancelling(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_order", notifyEmail, reason: cancelReason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error("cancel_failed");

      await openOrder(selectedOrder.id);
      await loadOrders(ordersPage);
      setFeedback({
        type: "success",
        message: json?.data?.emailSent ? "Pedido cancelado. Email enviado ao cliente." : "Pedido cancelado.",
      });
    } catch {
      setFeedback({ type: "error", message: "Não foi possível cancelar o pedido." });
    } finally {
      setCancelling(false);
    }
  }

  const canCancelOrder = selectedOrder && selectedOrder.status !== "cancelled" && selectedOrder.status !== "delivered";

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Pedidos</h3>
        <p className="helperText">Histórico de pedidos, carrinhos pendentes e rastreio de envios.</p>
      </div>

      <div className="ordersViewSwitch">
        <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}>
          Pedidos{orders.length > 0 && view === "orders" ? ` (${orders.length})` : ""}
        </button>
        <button className={view === "carts" ? "active" : ""} onClick={() => setView("carts")}>
          Carrinhos pendentes{carts.length > 0 && view === "carts" ? ` (${carts.length})` : ""}
        </button>
      </div>

      {view === "orders" && (
        <>
          <div className="searchContainer ordersFilterRow">
            <input
              type="text"
              placeholder="Buscar por email ou # do pedido..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="searchInput"
            />
          </div>

          <div className="quickFilterChips">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f.value}
                className={`quickFilterChip ${statusFilter === f.value ? "active" : ""}`}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading && <p className="loadingMsg">Carregando pedidos...</p>}
          {!loading && orders.length === 0 && (
            <p className="emptyMsg">
              {search || statusFilter ? "Nenhum pedido encontrado com esses filtros." : "Nenhum pedido ainda."}
            </p>
          )}

          <div className="ordersList">
            {orders.map((order) => (
              <button key={order.id} className="orderRow" onClick={() => openOrder(order.id)}>
                <img
                  src={order.thumbnail_url || "/file.svg"}
                  alt=""
                  className="orderRowThumb"
                />
                <span className="orderRowId">{displayOrderNumber(order)}</span>
                <span className="orderRowEmail">{order.customer_email ?? "—"}</span>
                <span className={`orderStatusBadge status-${order.status}`}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
                {order.has_physical && order.shipment_status && (
                  <span className="orderPhysicalBadge" title={SHIPMENT_STATUS_LABELS[order.shipment_status] ?? order.shipment_status}>
                    📦 {SHIPMENT_STATUS_LABELS[order.shipment_status] ?? order.shipment_status}
                  </span>
                )}
                <span className="orderRowMeta">{order.item_count} item(ns)</span>
                <span className="orderRowTotal">{formatMoney(order.total)}</span>
                <span className="orderRowDate">{new Date(order.created_at).toLocaleDateString("pt-BR")}</span>
              </button>
            ))}
          </div>

          {!loading && ordersTotal > ORDERS_PAGE_SIZE && (
            <div className="ordersPagination">
              <button
                className="btnSecondary"
                disabled={ordersPage <= 1}
                onClick={() => loadOrders(ordersPage - 1)}
              >
                ← Anterior
              </button>
              <span className="ordersPaginationInfo">
                Página {ordersPage} de {ordersTotalPages} · {ordersTotal} pedido(s)
              </span>
              <button
                className="btnSecondary"
                disabled={ordersPage >= ordersTotalPages}
                onClick={() => loadOrders(ordersPage + 1)}
              >
                Próxima →
              </button>
            </div>
          )}
        </>
      )}

      {view === "carts" && (
        <>
          {loading && <p className="loadingMsg">Carregando carrinhos...</p>}
          {!loading && carts.length === 0 && <p className="emptyMsg">Nenhum carrinho ativo no momento.</p>}
          <div className="ordersList">
            {carts.map((cart) => {
              const expanded = expandedCart === cart.customer_email;
              return (
                <div key={cart.customer_email} className="cartRowWrapper">
                  <button
                    className="cartRow"
                    onClick={() => setExpandedCart(expanded ? null : cart.customer_email)}
                  >
                    <span className="cartRowToggle">{expanded ? "▾" : "▸"}</span>
                    <span className="orderRowEmail">{cart.customer_email}</span>
                    <span className="cartItemCount">{cart.item_count} item(ns)</span>
                    <span className="orderRowTotal">{formatMoney(cart.cart_value)}</span>
                    <span className="orderRowDate">
                      atualizado {new Date(cart.last_updated).toLocaleString("pt-BR")}
                    </span>
                  </button>
                  {expanded && (
                    <div className="cartItemsList">
                      {cart.items.map((item, idx) => (
                        <div key={idx} className="cartItemRow">
                          <span>
                            {item.productName}{item.variationName ? ` — ${item.variationName}` : ""} × {item.quantity}
                            {item.productType === "physical" ? " 📦" : ""}
                          </span>
                          <span>{formatMoney(Number(item.unitPrice) * item.quantity)}</span>
                        </div>
                      ))}
                      {canManage && (
                        <button
                          type="button"
                          className="btnDanger cartCancelBtn"
                          disabled={cancellingCart === cart.customer_email}
                          onClick={() => cancelPendingCart(cart.customer_email)}
                        >
                          {cancellingCart === cart.customer_email ? "Cancelando..." : "Cancelar carrinho"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {(loadingDetail || selectedOrder) && (
        <div className="modalOverlay" onClick={closeOrder}>
          <div className="modalContent orderDetailModal" onClick={(e) => e.stopPropagation()}>
            {loadingDetail && <p>Carregando pedido...</p>}
            {selectedOrder && (
              <>
                <div className="orderDetailHeader">
                  <div>
                    <h4>Pedido {displayOrderNumber(selectedOrder)}</h4>
                    <p className="helperText">{selectedOrder.customer_email}</p>
                  </div>
                  <span className={`orderStatusBadge status-${selectedOrder.status}`}>
                    {STATUS_LABELS[selectedOrder.status] ?? selectedOrder.status}
                  </span>
                </div>

                <div className="orderDetailItems">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="orderDetailItemRich">
                      <img
                        src={item.image_url || "/file.svg"}
                        alt={item.product_name}
                        className="orderDetailItemThumb"
                      />
                      <div className="orderDetailItemInfo">
                        <span className="orderDetailItemName">
                          {item.product_name}{item.variation_name ? ` — ${item.variation_name}` : ""}
                        </span>
                        <span className="orderDetailItemMeta">
                          {item.category_name ?? "Sem categoria"} · {item.product_type === "physical" ? "Físico" : "Digital"}
                          {item.product_type === "physical" && formatWeight(item.weight_grams) && ` · ${formatWeight(item.weight_grams)}`}
                          {item.product_type === "physical" && item.length_cm && item.width_cm && item.height_cm &&
                            ` · ${item.length_cm}×${item.width_cm}×${item.height_cm}cm`}
                        </span>
                        <span className="orderDetailItemMeta">Qtd: {item.quantity} × {formatMoney(item.unit_price)}</span>
                      </div>
                      <span className="orderDetailItemPrice">{formatMoney(item.unit_price * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="orderDetailTotals">
                  <span>Subtotal: {formatMoney(selectedOrder.subtotal)}</span>
                  <span>Frete: {formatMoney(selectedOrder.shipping_fee)}</span>
                  <strong>Total: {formatMoney(selectedOrder.total)}</strong>
                </div>

                {selectedOrder.shippingAddress && (
                  <div className="orderDetailAddress">
                    <strong>Endereço de entrega</strong>
                    <p>
                      {selectedOrder.shippingAddress.recipient_name} — {selectedOrder.shippingAddress.street}, {selectedOrder.shippingAddress.number}
                      {selectedOrder.shippingAddress.complement ? ` (${selectedOrder.shippingAddress.complement})` : ""}
                      <br />
                      {selectedOrder.shippingAddress.neighborhood}, {selectedOrder.shippingAddress.city} - {selectedOrder.shippingAddress.state} · CEP {selectedOrder.shippingAddress.cep}
                    </p>
                  </div>
                )}

                {selectedOrder.paymentTransactions.length > 0 && (
                  <div className="orderDetailPayments">
                    <strong>Pagamento</strong>
                    {selectedOrder.paymentTransactions.map((tx) => (
                      <p key={tx.id}>{tx.method} — {tx.status} {tx.provider_txid ? `(${tx.provider_txid})` : ""}</p>
                    ))}
                  </div>
                )}

                {selectedOrder.has_physical && (
                  <div className="shipmentBlock">
                    <strong>Envio</strong>

                    <div className="shipmentStepper">
                      {SHIPMENT_STEPS.map((step, idx) => {
                        const currentIdx = SHIPMENT_STEPS.findIndex((s) => s.value === (selectedOrder.shipment?.status ?? "preparing"));
                        const isEndState = SHIPMENT_END_STATES.some((s) => s.value === selectedOrder.shipment?.status);
                        const done = !isEndState && currentIdx >= 0 && idx <= currentIdx;
                        return (
                          <div key={step.value} className={`shipmentStep ${done ? "done" : ""}`}>
                            <span className="shipmentStepDot" />
                            <span className="shipmentStepLabel">{step.label}</span>
                            {idx < SHIPMENT_STEPS.length - 1 && <span className="shipmentStepLine" />}
                          </div>
                        );
                      })}
                    </div>

                    {selectedOrder.shipmentEvents.length > 0 && (
                      <div className="shipmentTimelineStaff">
                        {selectedOrder.shipmentEvents.slice().reverse().map((event) => (
                          <div key={event.id} className="shipmentTimelineStaffItem">
                            <span className="shipmentTimelineDot" />
                            <div>
                              <strong>{SHIPMENT_STATUS_LABELS[event.status] ?? event.status}</strong>
                              {(event.city || event.state) && (
                                <span className="helperText"> — {[event.city, event.state].filter(Boolean).join(", ")}</span>
                              )}
                              {event.description && <p className="helperText">{event.description}</p>}
                              <p className="shipmentTimelineDate">{new Date(event.created_at).toLocaleString("pt-BR")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {canManage ? (
                      <>
                        <div className="shipmentEditRow">
                          <select value={shipmentStatus} onChange={(e) => setShipmentStatus(e.target.value)}>
                            <optgroup label="Andamento">
                              {SHIPMENT_STEPS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </optgroup>
                            <optgroup label="Encerramento">
                              {SHIPMENT_END_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </optgroup>
                          </select>
                          <input
                            placeholder={shipmentStatus === "posted" && !trackingCode ? "Gerado automaticamente ao salvar" : "Código de rastreio"}
                            value={trackingCode}
                            onChange={(e) => setTrackingCode(e.target.value)}
                            className="settingsInput"
                          />
                        </div>
                        <div className="shipmentEventLocationRow">
                          <input
                            placeholder="Cidade do evento (ex: Curitiba)"
                            value={eventCity}
                            onChange={(e) => setEventCity(e.target.value)}
                            className="settingsInput"
                          />
                          <input
                            placeholder="UF"
                            value={eventState}
                            onChange={(e) => setEventState(e.target.value.toUpperCase().slice(0, 2))}
                            maxLength={2}
                            className="settingsInput shipmentEventState"
                          />
                        </div>
                        <input
                          placeholder="Observação (opcional)"
                          value={eventDescription}
                          onChange={(e) => setEventDescription(e.target.value)}
                          className="settingsInput"
                        />
                        <p className="helperText">
                          Ao marcar &ldquo;Postado&rdquo; sem digitar um código, um código de rastreio é gerado automaticamente.
                          Cada mudança de status vira uma etapa nova na timeline que o cliente vê — só grava se algo
                          realmente mudou.
                        </p>
                        <button className="btn" onClick={saveShipment} disabled={savingShipment || !shipmentHasChanges}>
                          {savingShipment ? "Salvando..." : "Salvar envio"}
                        </button>
                      </>
                    ) : (
                      <p className="helperText">
                        {selectedOrder.shipment?.tracking_code
                          ? `Rastreio: ${selectedOrder.shipment.tracking_code}`
                          : "Sem código de rastreio ainda."}
                      </p>
                    )}
                  </div>
                )}

                {canManage && (
                  <div className="statusEditorCard">
                    <strong>Ações do pedido</strong>

                    <div className="orderQuickActions">
                      {selectedOrder.status === "pending_payment" && (
                        <button className="btnSecondary" onClick={() => setOrderStatus("paid")} disabled={savingStatus}>
                          Marcar como pago
                        </button>
                      )}
                      {!selectedOrder.has_physical && selectedOrder.status === "paid" && (
                        <button className="btnSecondary" onClick={() => setOrderStatus("delivered")} disabled={savingStatus}>
                          Marcar como entregue
                        </button>
                      )}
                      {(selectedOrder.status === "paid" || selectedOrder.status === "delivered") && (
                        <button className="btnSecondary" onClick={() => setOrderStatus("refunded")} disabled={savingStatus}>
                          Marcar como reembolsado
                        </button>
                      )}
                    </div>

                    <label className="notifyRow">
                      <input
                        type="checkbox"
                        checked={notifyEmail}
                        onChange={(e) => setNotifyEmail(e.target.checked)}
                      />
                      Notificar cliente por email quando algo mudar
                    </label>

                    <input
                      placeholder="Motivo (opcional — aparece no email de cancelamento/reembolso)"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="settingsInput"
                    />

                    {feedback && (
                      <p className={`feedbackBanner ${feedback.type}`}>{feedback.message}</p>
                    )}

                    <div className="statusEditorActions">
                      {canCancelOrder && (
                        <button className="btnDanger" onClick={cancelOrder} disabled={cancelling}>
                          {cancelling ? "Cancelando..." : "❌ Cancelar pedido"}
                        </button>
                      )}
                      <button className="btnSecondary" onClick={closeOrder}>Fechar</button>
                    </div>
                  </div>
                )}

                {!canManage && (
                  <button className="btnSecondary" onClick={closeOrder}>Fechar</button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
