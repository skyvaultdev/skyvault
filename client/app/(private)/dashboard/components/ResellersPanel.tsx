"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import "./ResellersPanel.css";
import { useModal } from "@/app/(components)/modal/ModalProvider";

type Reseller = {
  id: number;
  referral_code: string;
  status: "invited" | "approved" | "rejected" | "suspended" | "pending";
  display_name: string | null;
  email: string;
  username: string | null;
  applied_at: string;
  approved_at: string | null;
  note: string | null;
  authorized_products: number;
  balance_due: number;
  total_paid: number;
  pending_payout_requests: number;
};

type PayoutRequest = {
  id: number;
  reseller_id: number;
  amount: number;
  status: "requested" | "approved" | "rejected" | "paid";
  requested_at: string;
  resolved_at: string | null;
  note: string | null;
  reseller_email: string;
  display_name: string | null;
};

type ResellerProduct = {
  id: number;
  product_id: number;
  product_name: string;
  slug: string;
  price: number;
  commission_percent: number;
};

type CatalogProduct = { id: number; name: string; slug: string; category_id: number | null; category_name: string | null; image_url: string | null };
type Category = { id: number; name: string; slug: string };

const STATUS_LABELS: Record<string, string> = {
  invited: "Convite enviado — aguardando aceite",
  pending: "Aguardando aprovação",
  approved: "Aprovado",
  rejected: "Rejeitado / recusado",
  suspended: "Suspenso",
};

function money(value: number | string) {
  return `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default function ResellersPanel() {
  const modal = useModal();
  const [tab, setTab] = useState<"resellers" | "payouts">("resellers");
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [managingId, setManagingId] = useState<number | null>(null);
  const [managedProducts, setManagedProducts] = useState<ResellerProduct[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState<number | "">("");
  const [addProductId, setAddProductId] = useState<number | "">("");
  const [addCommission, setAddCommission] = useState("10");
  const [savingProduct, setSavingProduct] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const [pixModal, setPixModal] = useState<{ payload: string; holderName: string | null; keyType: string | null; amount: number } | null>(null);
  const [loadingPix, setLoadingPix] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resellersRes, payoutsRes] = await Promise.all([
        fetch("/api/resellers", { cache: "no-store" }),
        fetch("/api/resellers/payout-requests", { cache: "no-store" }),
      ]);
      const resellersJson = await resellersRes.json();
      const payoutsJson = await payoutsRes.json();
      setResellers(resellersRes.ok && Array.isArray(resellersJson.data) ? resellersJson.data : []);
      setPayouts(payoutsRes.ok && Array.isArray(payoutsJson.data) ? payoutsJson.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function inviteReseller() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviting(true);
    try {
      const res = await fetch("/api/resellers/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message =
          json.error === "USER_NOT_FOUND" ? "Não existe cliente cadastrado com esse email."
          : json.error === "ALREADY_RESELLER_OR_INVITED" ? "Esse cliente já é revendedor ou já tem um convite pendente."
          : "Não foi possível enviar o convite.";
        await modal.alert(message);
        return;
      }
      setInviteEmail("");
      await load();
    } finally {
      setInviting(false);
    }
  }

  async function setStatus(id: number, status: string) {
    const res = await fetch(`/api/resellers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      await modal.alert("Não foi possível atualizar o revendedor.");
      return;
    }
    await load();
  }

  async function openManageProducts(reseller: Reseller) {
    setManagingId(reseller.id);
    setAddProductId("");
    setAddCommission("10");
    setProductSearch("");
    setProductCategoryFilter("");
    const [productsRes, catalogRes, categoriesRes] = await Promise.all([
      fetch(`/api/resellers/${reseller.id}/products`, { cache: "no-store" }),
      fetch("/api/products", { cache: "no-store" }),
      fetch("/api/categories", { cache: "no-store" }),
    ]);
    const productsJson = await productsRes.json();
    const catalogJson = await catalogRes.json();
    const categoriesJson = await categoriesRes.json();
    setManagedProducts(productsRes.ok && Array.isArray(productsJson.data) ? productsJson.data : []);
    setCatalog(catalogRes.ok && Array.isArray(catalogJson.data) ? catalogJson.data : []);
    setCategories(categoriesRes.ok && Array.isArray(categoriesJson.data) ? categoriesJson.data : []);
  }

  function closeManageProducts() {
    setManagingId(null);
    setManagedProducts([]);
  }

  async function addProduct() {
    if (!managingId || !addProductId) return;
    const commission = Number(addCommission);
    if (!(commission > 0 && commission <= 100)) {
      await modal.alert("Informe uma comissão entre 0 e 100%.");
      return;
    }
    setSavingProduct(true);
    try {
      const res = await fetch(`/api/resellers/${managingId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: addProductId, commissionPercent: commission }),
      });
      if (!res.ok) {
        await modal.alert("Não foi possível autorizar o produto.");
        return;
      }
      const reseller = resellers.find((r) => r.id === managingId);
      if (reseller) await openManageProducts(reseller);
      await load();
    } finally {
      setSavingProduct(false);
    }
  }

  async function removeProduct(productId: number) {
    if (!managingId) return;
    const res = await fetch(`/api/resellers/${managingId}/products/${productId}`, { method: "DELETE" });
    if (!res.ok) {
      await modal.alert("Não foi possível remover a autorização.");
      return;
    }
    setManagedProducts((prev) => prev.filter((p) => p.product_id !== productId));
    await load();
  }

  async function openPixQr(payoutId: number) {
    setLoadingPix(payoutId);
    try {
      const res = await fetch(`/api/resellers/payout-requests/${payoutId}/pix-qr`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        await modal.alert(json.error === "RESELLER_NO_PIX_KEY" ? "Esse revendedor ainda não cadastrou uma chave PIX." : "Não foi possível gerar o QR code.");
        return;
      }
      setPixModal({ payload: json.data.payload, holderName: json.data.pixHolderName, keyType: json.data.pixKeyType, amount: json.data.amount });
    } finally {
      setLoadingPix(null);
    }
  }

  async function resolvePayout(id: number, action: "paid" | "rejected") {
    const confirmed = await modal.confirm(
      action === "paid"
        ? "Confirma que já pagou esse saque por fora do sistema (Pix, transferência etc.)?"
        : "Rejeitar essa solicitação de saque? As comissões voltam a ficar disponíveis pro revendedor solicitar de novo."
    );
    if (!confirmed) return;

    const res = await fetch(`/api/resellers/payout-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      await modal.alert("Não foi possível resolver a solicitação.");
      return;
    }
    await load();
  }

  const managingReseller = resellers.find((r) => r.id === managingId) ?? null;
  const availableCatalog = catalog
    .filter((c) => !managedProducts.some((mp) => mp.product_id === c.id))
    .filter((c) => !productCategoryFilter || c.category_id === productCategoryFilter)
    .filter((c) => !productSearch.trim() || c.name.toLowerCase().includes(productSearch.trim().toLowerCase()));

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Revendedores</h3>
        <p className="helperText">
          Convide clientes pra serem revendedores, escolha quais produtos cada um pode vender (com a % de comissão de
          cada um) e resolva solicitações de saque. O convite aparece na aba de notificações do cliente — ele precisa
          aceitar antes de virar revendedor.
        </p>
      </div>

      <div className="resellerInviteRow">
        <input
          type="email"
          className="settingsInput"
          placeholder="Email do cliente a convidar..."
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
        />
        <button className="btn" onClick={() => void inviteReseller()} disabled={inviting || !inviteEmail.trim()}>
          {inviting ? "Enviando..." : "Convidar"}
        </button>
      </div>

      <div className="resellerTabs">
        <button className={`resellerTabBtn ${tab === "resellers" ? "active" : ""}`} onClick={() => setTab("resellers")}>
          Revendedores
        </button>
        <button className={`resellerTabBtn ${tab === "payouts" ? "active" : ""}`} onClick={() => setTab("payouts")}>
          Solicitações de saque
          {payouts.some((p) => p.status === "requested") && (
            <span className="resellerBadge">
              {payouts.filter((p) => p.status === "requested").length}
            </span>
          )}
        </button>
      </div>

      {loading && <p className="helperText">Carregando...</p>}

      {!loading && tab === "resellers" && (
        <div className="resellerList">
          {resellers.length === 0 && <p className="emptyMsg">Nenhum revendedor convidado ainda.</p>}
          {resellers.map((r) => (
            <div key={r.id} className="resellerCard">
              <div className="resellerCardHeader">
                <div>
                  <strong>{r.display_name || r.username || r.email}</strong>
                  <span className="helperText"> — {r.email}</span>
                </div>
                <span className={`resellerStatusBadge status-${r.status}`}>{STATUS_LABELS[r.status] ?? r.status}</span>
              </div>

              <div className="resellerCardMeta">
                <span>Código: <code>{r.referral_code}</code></span>
                <span>{r.authorized_products} produto(s) autorizado(s)</span>
                <span>Saldo devido: <strong>{money(r.balance_due)}</strong></span>
                <span>Já pago: {money(r.total_paid)}</span>
                {r.pending_payout_requests > 0 && (
                  <span className="resellerPendingFlag">{r.pending_payout_requests} saque(s) pendente(s)</span>
                )}
              </div>

              <div className="resellerCardActions">
                {r.status === "invited" && (
                  <button className="btnDanger" onClick={() => void setStatus(r.id, "rejected")}>Cancelar convite</button>
                )}
                {r.status === "approved" && (
                  <button className="btnDanger" onClick={() => void setStatus(r.id, "suspended")}>Suspender</button>
                )}
                {(r.status === "suspended" || r.status === "rejected") && (
                  <button className="btnSecondary" onClick={() => void setStatus(r.id, "approved")}>Reativar</button>
                )}
                <button className="btn" onClick={() => void openManageProducts(r)}>Gerenciar produtos</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "payouts" && (
        <div className="resellerList">
          {payouts.length === 0 && <p className="emptyMsg">Nenhuma solicitação de saque ainda.</p>}
          {payouts.map((p) => (
            <div key={p.id} className="resellerCard">
              <div className="resellerCardHeader">
                <div>
                  <strong>{p.display_name || p.reseller_email}</strong>
                  <span className="helperText"> — {p.reseller_email}</span>
                </div>
                <span className={`resellerStatusBadge status-${p.status}`}>{p.status}</span>
              </div>
              <div className="resellerCardMeta">
                <span>Valor: <strong>{money(p.amount)}</strong></span>
                <span>Solicitado em: {new Date(p.requested_at).toLocaleString("pt-BR")}</span>
                {p.note && <span>Nota: {p.note}</span>}
              </div>
              {p.status === "requested" && (
                <div className="resellerCardActions">
                  <button className="btn" onClick={() => void openPixQr(p.id)} disabled={loadingPix === p.id}>
                    {loadingPix === p.id ? "Gerando..." : "Pagar via PIX (QR)"}
                  </button>
                  <button className="btnSecondary" onClick={() => void resolvePayout(p.id, "paid")}>Marcar como pago</button>
                  <button className="btnDanger" onClick={() => void resolvePayout(p.id, "rejected")}>Rejeitar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {managingReseller && (
        <div className="modalOverlay" onClick={closeManageProducts}>
          <div className="modalContent resellerProductsModal" onClick={(e) => e.stopPropagation()}>
            <h4>Produtos de {managingReseller.display_name || managingReseller.email}</h4>

            <div className="resellerManagedSection">
              <span className="resellerModalLabel">Já autorizados ({managedProducts.length})</span>
              <div className="resellerManagedList">
                {managedProducts.length === 0 && <p className="emptyMsg">Nenhum produto autorizado ainda.</p>}
                {managedProducts.map((p) => (
                  <div key={p.id} className="resellerManagedItem">
                    <span>{p.product_name}</span>
                    <span className="resellerManagedPercent">{p.commission_percent}%</span>
                    <button className="btnDanger btnSmall" onClick={() => void removeProduct(p.product_id)}>Remover</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="resellerAddSection">
              <span className="resellerModalLabel">Autorizar novo produto</span>

              <div className="resellerProductFilters">
                <input
                  className="settingsInput"
                  placeholder="Buscar produto por nome..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                <select
                  className="settingsInput"
                  value={productCategoryFilter}
                  onChange={(e) => { setProductCategoryFilter(e.target.value ? Number(e.target.value) : ""); setAddProductId(""); }}
                >
                  <option value="">Todas as categorias</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="resellerProductPicker">
                {availableCatalog.length === 0 && <p className="emptyMsg">Nenhum produto encontrado.</p>}
                {availableCatalog.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`resellerProductPickerItem ${addProductId === p.id ? "selected" : ""}`}
                    onClick={() => setAddProductId(p.id)}
                  >
                    <img src={p.image_url || "/placeholders/product.svg"} alt="" className="resellerProductPickerThumb" />
                    <span className="resellerProductPickerInfo">
                      <strong>{p.name}</strong>
                      <span className="helperText">{p.category_name ?? "Sem categoria"}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="resellerProductAddRow">
                <input
                  className="settingsInput resellerCommissionInput"
                  type="number"
                  min={1}
                  max={100}
                  step="0.1"
                  value={addCommission}
                  onChange={(e) => setAddCommission(e.target.value)}
                  placeholder="% comissão"
                />
                <button className="btn" onClick={() => void addProduct()} disabled={savingProduct || !addProductId}>
                  {savingProduct ? "Salvando..." : "Autorizar"}
                </button>
              </div>
            </div>

            <button className="btnSecondary" onClick={closeManageProducts}>Fechar</button>
          </div>
        </div>
      )}

      {pixModal && (
        <div className="modalOverlay" onClick={() => setPixModal(null)}>
          <div className="modalContent resellerPixModal" onClick={(e) => e.stopPropagation()}>
            <h4>Pagar via PIX</h4>
            <p className="helperText">
              Escaneie com o app do seu banco. Valor: <strong>{money(pixModal.amount)}</strong>
              {pixModal.holderName && <> — titular: <strong>{pixModal.holderName}</strong></>}
              {pixModal.keyType && ` (chave ${pixModal.keyType})`}
            </p>
            <div className="resellerPixQrBox">
              <QRCodeSVG value={pixModal.payload} size={220} />
            </div>
            <button
              className="btnSecondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(pixModal.payload);
                  await modal.alert("Código PIX copiado — cole no app do banco em \"Pix Copia e Cola\".");
                } catch {
                  await modal.alert("Não foi possível copiar automaticamente.");
                }
              }}
            >
              Copiar código
            </button>
            <button className="btnSecondary" onClick={() => setPixModal(null)}>Fechar</button>
          </div>
        </div>
      )}
    </section>
  );
}
