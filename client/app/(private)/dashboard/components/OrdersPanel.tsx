"use client";

import { useEffect, useState, useCallback } from "react";
import "./OrdersPanel.css";

type OrderRow = {
  id: number;
  status: string;
  total: number;
  subtotal: number;
  shipping_fee: number;
  platform_fee: number;
  created_at: string;
  paid_at: string | null;
  customer_email: string | null;
  item_count: number;
  has_physical: boolean;
  shipment_status: string | null;
  tracking_code: string | null;
};

type PendingCart = {
  customer_email: string;
  item_count: number;
  cart_value: number;
  last_updated: string;
};

type OrderDetail = OrderRow & {
  items: Array<{
    id: number; product_name: string; variation_name: string | null;
    quantity: number; unit_price: number; product_type: "digital" | "physical";
  }>;
  shippingAddress: any | null;
  paymentTransactions: Array<{ id: number; method: string; status: string; provider_txid: string | null; created_at: string }>;
  shipment: { id: number; status: string; tracking_code: string | null; carrier_name: string | null } | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  paid: "Pago",
  delivered: "Entregue",
  preparing: "Preparando envio",
  shipped: "Enviado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const SHIPMENT_STATUS_OPTIONS = ["preparing", "posted", "in_transit", "delivered", "returned", "cancelled"];

export default function OrdersPanel({ canManage }: { canManage: boolean }) {
  const [view, setView] = useState<"orders" | "carts">("orders");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [carts, setCarts] = useState<PendingCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [trackingCode, setTrackingCode] = useState("");
  const [shipmentStatus, setShipmentStatus] = useState("");
  const [savingShipment, setSavingShipment] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      setOrders(res.ok && Array.isArray(json.data) ? json.data : []);
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
    if (view === "orders") void loadOrders();
    else void loadCarts();
  }, [view, loadOrders, loadCarts]);

  async function openOrder(id: number) {
    setLoadingDetail(true);
    setSelectedOrder(null);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setSelectedOrder(json.data);
        setTrackingCode(json.data.shipment?.tracking_code || "");
        setShipmentStatus(json.data.shipment?.status || "preparing");
      }
    } finally {
      setLoadingDetail(false);
    }
  }

  async function saveShipment() {
    if (!selectedOrder) return;
    setSavingShipment(true);
    try {
      await fetch(`/api/admin/orders/${selectedOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingCode, shipmentStatus }),
      });
      await openOrder(selectedOrder.id);
      await loadOrders();
    } finally {
      setSavingShipment(false);
    }
  }

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Pedidos</h3>
        <p className="helperText">Histórico de pedidos, carrinhos pendentes e rastreio de envios.</p>
      </div>

      <div className="ordersViewSwitch">
        <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}>Pedidos</button>
        <button className={view === "carts" ? "active" : ""} onClick={() => setView("carts")}>Carrinhos pendentes</button>
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
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="ordersStatusSelect">
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
              <option value="pending">Pendente</option>
            </select>
          </div>

          {loading && <p>Carregando...</p>}
          {!loading && orders.length === 0 && <p className="emptyMsg">Nenhum pedido encontrado.</p>}

          <div className="ordersList">
            {orders.map((order) => (
              <button key={order.id} className="orderRow" onClick={() => openOrder(order.id)}>
                <span className="orderRowId">#{order.id}</span>
                <span className="orderRowEmail">{order.customer_email ?? "—"}</span>
                <span className={`orderStatusBadge status-${order.status}`}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
                {order.has_physical && <span className="orderPhysicalBadge">📦</span>}
                <span className="orderRowTotal">
                  R$ {Number(order.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                <span className="orderRowDate">{new Date(order.created_at).toLocaleDateString("pt-BR")}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {view === "carts" && (
        <>
          {loading && <p>Carregando...</p>}
          {!loading && carts.length === 0 && <p className="emptyMsg">Nenhum carrinho ativo.</p>}
          <div className="ordersList">
            {carts.map((cart) => (
              <div key={cart.customer_email} className="cartRow">
                <span className="orderRowEmail">{cart.customer_email}</span>
                <span>{cart.item_count} item(ns)</span>
                <span className="orderRowTotal">
                  R$ {Number(cart.cart_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                <span className="orderRowDate">
                  atualizado {new Date(cart.last_updated).toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {(loadingDetail || selectedOrder) && (
        <div className="modalOverlay" onClick={() => setSelectedOrder(null)}>
          <div className="modalContent orderDetailModal" onClick={(e) => e.stopPropagation()}>
            {loadingDetail && <p>Carregando pedido...</p>}
            {selectedOrder && (
              <>
                <h4>Pedido #{selectedOrder.id}</h4>
                <p className="helperText">{selectedOrder.customer_email}</p>

                <div className="orderDetailItems">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="orderDetailItem">
                      <span>
                        {item.product_name}{item.variation_name ? ` — ${item.variation_name}` : ""} × {item.quantity}
                        {item.product_type === "physical" ? " 📦" : ""}
                      </span>
                      <span>R$ {(Number(item.unit_price) * item.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>

                <div className="orderDetailTotals">
                  <span>Subtotal: R$ {Number(selectedOrder.subtotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  <span>Frete: R$ {Number(selectedOrder.shipping_fee).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  <span>Taxa da plataforma: R$ {Number(selectedOrder.platform_fee).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  <strong>Total: R$ {Number(selectedOrder.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
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

                {selectedOrder.has_physical !== false && (selectedOrder.shipment || selectedOrder.shippingAddress) && (
                  <div className="orderDetailShipment">
                    <strong>Envio</strong>
                    {canManage ? (
                      <>
                        <select value={shipmentStatus} onChange={(e) => setShipmentStatus(e.target.value)}>
                          {SHIPMENT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input
                          placeholder="Código de rastreio"
                          value={trackingCode}
                          onChange={(e) => setTrackingCode(e.target.value)}
                          className="settingsInput"
                        />
                        <button className="btn" onClick={saveShipment} disabled={savingShipment}>
                          {savingShipment ? "Salvando..." : "Salvar envio"}
                        </button>
                      </>
                    ) : (
                      <p>{selectedOrder.shipment?.status ?? "preparing"} {selectedOrder.shipment?.tracking_code ? `— ${selectedOrder.shipment.tracking_code}` : ""}</p>
                    )}
                  </div>
                )}

                <button className="btnSecondary" onClick={() => setSelectedOrder(null)}>Fechar</button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
