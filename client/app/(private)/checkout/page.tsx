"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./checkout.css";

type CartItem = {
  cart_item_id: number;
  product_name: string;
  slug: string;
  variation_name: string;
  product_type: "digital" | "physical";
  unit_price: number;
  quantity: number;
  image_url: string | null;
};

type DeliveredItem = {
  productName: string;
  variationName?: string | null;
  type: "key" | "file" | "infinite";
  content: string;
};

type ShippingQuote = {
  carrierId: number | null;
  carrierName: string;
  serviceName: string;
  price: number;
  etaDays: number;
};

type AddressForm = {
  recipientName: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

const EMPTY_ADDRESS: AddressForm = {
  recipientName: "", cep: "", street: "", number: "",
  complement: "", neighborhood: "", city: "", state: "",
};

type CheckoutStage = "loading" | "review" | "address" | "awaiting_payment" | "delivered" | "empty";

export default function CheckoutPage() {
  const [stage, setStage] = useState<CheckoutStage>("loading");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<"mock" | "efibank" | null>(null);
  const [deliveredItems, setDeliveredItems] = useState<DeliveredItem[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [quoting, setQuoting] = useState(false);
  const [selectedQuoteIndex, setSelectedQuoteIndex] = useState<number | null>(null);

  const hasPhysical = cart.some((item) => item.product_type === "physical");
  const selectedQuote = selectedQuoteIndex !== null ? quotes[selectedQuoteIndex] : null;

  useEffect(() => {
    void loadCart();
  }, []);

  async function loadCart() {
    const res = await fetch("/api/cart", { cache: "no-store" });
    const json = await res.json();
    const items: CartItem[] = res.ok && Array.isArray(json.data) ? json.data : [];
    setCart(items);
    setStage(items.length === 0 ? "empty" : "review");
  }

  async function loadProfileIntoAddress() {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) {
        setAddress({
          recipientName: json.data.full_name || "",
          cep: json.data.cep || "",
          street: json.data.street || "",
          number: json.data.number || "",
          complement: json.data.complement || "",
          neighborhood: json.data.neighborhood || "",
          city: json.data.city || "",
          state: json.data.state || "",
        });
      }
    } catch {
      // sem perfil salvo ainda — cliente preenche na mão
    }
  }

  const subtotal = cart.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0);
  const shippingFee = selectedQuote?.price ?? 0;
  const total = subtotal + shippingFee;

  function goToAddressStep() {
    void loadProfileIntoAddress();
    setStage("address");
  }

  async function handleCepBlur() {
    const digits = address.cep.replace(/\D/g, "");
    if (digits.length !== 8) return;

    setLookingUpCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setAddress((prev) => ({
          ...prev,
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
      }
    } catch {
      // busca de CEP é só conveniência
    } finally {
      setLookingUpCep(false);
    }
  }

  async function handleQuoteShipping() {
    setQuoting(true);
    setErrorMessage("");
    setQuotes([]);
    setSelectedQuoteIndex(null);

    try {
      const res = await fetch("/api/checkout/quote-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cep: address.cep }),
      });
      const json = await res.json();

      if (!res.ok || !Array.isArray(json.data) || json.data.length === 0) {
        setErrorMessage("Não foi possível calcular o frete pra esse CEP.");
        return;
      }

      setQuotes(json.data);
      setSelectedQuoteIndex(0);
    } finally {
      setQuoting(false);
    }
  }

  function isAddressComplete() {
    return (
      address.recipientName.trim() &&
      address.cep.replace(/\D/g, "").length === 8 &&
      address.street.trim() &&
      address.number.trim() &&
      address.neighborhood.trim() &&
      address.city.trim() &&
      address.state.trim().length === 2
    );
  }

  async function handleCreateOrder() {
    setSubmitting(true);
    setErrorMessage("");

    try {
      const shippingPayload = hasPhysical && selectedQuote
        ? {
            recipientName: address.recipientName,
            cep: address.cep.replace(/\D/g, ""),
            street: address.street,
            number: address.number,
            complement: address.complement,
            neighborhood: address.neighborhood,
            city: address.city,
            state: address.state,
            carrierId: selectedQuote.carrierId,
            carrierName: selectedQuote.carrierName,
            serviceName: selectedQuote.serviceName,
            price: selectedQuote.price,
            etaDays: selectedQuote.etaDays,
          }
        : undefined;

      const res = await fetch("/api/checkout/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipping: shippingPayload }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (String(json.error).startsWith("OUT_OF_STOCK")) {
          setErrorMessage(`Item esgotado: ${String(json.error).split(":")[1] ?? ""}`);
        } else if (json.error === "MISSING_SHIPPING_ADDRESS" || json.error === "MISSING_SHIPPING_QUOTE") {
          setErrorMessage("Preencha o endereço e escolha uma opção de frete.");
        } else if (json.error === "EMPTY_CART") {
          setErrorMessage("Seu carrinho está vazio.");
        } else {
          setErrorMessage("Não deu pra criar o pedido. Tente novamente.");
        }
        return;
      }

      setOrderId(json.data.orderId);
      setPixCopyPaste(json.data.pixCopyPaste ?? null);
      setPaymentProvider(json.data.provider ?? "mock");
      setStage("awaiting_payment");
    } finally {
      setSubmitting(false);
    }
  }

  // Com EfiBank de verdade não tem botão de "confirmar" — o cliente paga
  // o Pix no banco dele e a gente descobre pelo webhook. Enquanto isso,
  // fica de olho no próprio pedido pra saber quando liberar a entrega.
  useEffect(() => {
    if (stage !== "awaiting_payment" || paymentProvider !== "efibank" || !orderId) return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/checkout/order/${orderId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) return;

      if (json.data.status === "paid" || json.data.status === "delivered") {
        const delivered: DeliveredItem[] = (json.data.items ?? [])
          .filter((item: any) => item.deliveredContent)
          .flatMap((item: any) =>
            item.deliveredContent.map((content: string) => ({
              productName: item.product_name,
              variationName: item.variation_name,
              type: content.startsWith("/api/files/") ? "file" : "key",
              content,
            }))
          );
        setDeliveredItems(delivered);
        setStage("delivered");
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [stage, paymentProvider, orderId]);

  async function handleMockConfirm() {
    if (!orderId) return;
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/checkout/mock-confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json();

      if (!res.ok) {
        setErrorMessage("Não deu pra confirmar o pagamento de teste.");
        return;
      }

      setDeliveredItems(json.data.deliveredItems ?? []);
      setStage("delivered");
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "loading") {
    return <main className="checkoutPage"><p className="checkoutHint">Carregando...</p></main>;
  }

  if (stage === "empty") {
    return (
      <main className="checkoutPage">
        <div className="checkoutCard">
          <h1>Seu carrinho está vazio</h1>
          <Link href="/" className="checkoutBtnPrimary">Voltar à loja</Link>
        </div>
      </main>
    );
  }

  if (stage === "delivered") {
    return (
      <main className="checkoutPage">
        <div className="checkoutCard">
          <h1>Pedido #{orderId} confirmado 🎉</h1>
          <p className="checkoutHint">
            {deliveredItems.length > 0
              ? "Enviamos os dados de acesso pro seu e-mail. Aqui está uma cópia:"
              : hasPhysical
                ? "Seu pedido está sendo preparado pro envio. Acompanhe o status na sua área de pedidos."
                : ""}
          </p>

          {deliveredItems.length > 0 && (
            <div className="deliveredList">
              {deliveredItems.map((item, i) => (
                <div key={i} className="deliveredItem">
                  <strong>{item.variationName ? `${item.productName} — ${item.variationName}` : item.productName}</strong>
                  {item.type === "file" ? (
                    <a href={item.content} target="_blank" rel="noopener noreferrer">Baixar arquivo</a>
                  ) : (
                    <code>{item.content}</code>
                  )}
                </div>
              ))}
            </div>
          )}

          <Link href="/" className="checkoutBtnPrimary">Voltar à loja</Link>
        </div>
      </main>
    );
  }

  if (stage === "address") {
    return (
      <main className="checkoutPage">
        <div className="checkoutCard">
          <h1>Endereço de entrega</h1>

          <label className="checkoutLabel">
            Nome do destinatário
            <input value={address.recipientName} onChange={(e) => setAddress({ ...address, recipientName: e.target.value })} />
          </label>

          <label className="checkoutLabel">
            CEP {lookingUpCep && <span className="checkoutCepLoading">buscando...</span>}
            <input
              value={address.cep}
              onChange={(e) => setAddress({ ...address, cep: e.target.value.replace(/[^\d-]/g, "") })}
              onBlur={handleCepBlur}
              placeholder="00000-000"
              maxLength={9}
            />
          </label>

          <div className="checkoutRow">
            <label className="checkoutLabel checkoutGrow">
              Rua
              <input value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
            </label>
            <label className="checkoutLabel checkoutNumber">
              Número
              <input value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} />
            </label>
          </div>

          <label className="checkoutLabel">
            Complemento
            <input value={address.complement} onChange={(e) => setAddress({ ...address, complement: e.target.value })} />
          </label>

          <div className="checkoutRow">
            <label className="checkoutLabel checkoutGrow">
              Bairro
              <input value={address.neighborhood} onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })} />
            </label>
            <label className="checkoutLabel checkoutGrow">
              Cidade
              <input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
            </label>
            <label className="checkoutLabel checkoutState">
              UF
              <input
                value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase().slice(0, 2) })}
                maxLength={2}
              />
            </label>
          </div>

          {errorMessage && <p className="checkoutError">{errorMessage}</p>}

          <button
            className="checkoutBtnSecondary"
            onClick={handleQuoteShipping}
            disabled={!isAddressComplete() || quoting}
          >
            {quoting ? "Calculando..." : "Calcular frete"}
          </button>

          {quotes.length > 0 && (
            <div className="shippingQuoteList">
              {quotes.map((quote, i) => (
                <label key={i} className={`shippingQuoteItem ${selectedQuoteIndex === i ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="shippingQuote"
                    checked={selectedQuoteIndex === i}
                    onChange={() => setSelectedQuoteIndex(i)}
                  />
                  <div className="shippingQuoteInfo">
                    <strong>{quote.carrierName} — {quote.serviceName}</strong>
                    <span>até {quote.etaDays} dias úteis</span>
                  </div>
                  <span className="shippingQuotePrice">R$ {quote.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </label>
              ))}
            </div>
          )}

          <div className="checkoutTotal">
            <span>Total (com frete)</span>
            <strong>R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
          </div>

          <button
            className="checkoutBtnPrimary"
            onClick={handleCreateOrder}
            disabled={!selectedQuote || submitting}
          >
            {submitting ? "Criando pedido..." : "Pagar com Pix"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="checkoutPage">
      <div className="checkoutCard">
        <h1>Finalizar compra</h1>

        <div className="checkoutItems">
          {cart.map((item) => (
            <div key={item.cart_item_id} className="checkoutItem">
              <img src={item.image_url || "/file.svg"} alt={item.product_name} />
              <div className="checkoutItemInfo">
                <strong>{item.product_name}</strong>
                {item.variation_name && <span>{item.variation_name}</span>}
                <span>Qtd: {item.quantity}{item.product_type === "physical" ? " · 📦 físico" : ""}</span>
              </div>
              <span className="checkoutItemPrice">
                R$ {(Number(item.unit_price) * item.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>

        <div className="checkoutTotal">
          <span>{hasPhysical ? "Subtotal (frete calculado a seguir)" : "Total"}</span>
          <strong>R$ {subtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
        </div>

        {errorMessage && <p className="checkoutError">{errorMessage}</p>}

        {stage === "review" && (
          <button
            className="checkoutBtnPrimary"
            onClick={hasPhysical ? goToAddressStep : handleCreateOrder}
            disabled={submitting}
          >
            {hasPhysical ? "Continuar para entrega" : submitting ? "Criando pedido..." : "Pagar com Pix"}
          </button>
        )}

        {stage === "awaiting_payment" && (
          <div className="checkoutPixBox">
            <p className="checkoutHint">Pedido #{orderId} criado — aguardando pagamento.</p>

            {pixCopyPaste && (
              <>
                <code className="checkoutPixCode">{pixCopyPaste}</code>
                <button
                  type="button"
                  className="checkoutBtnSecondary"
                  onClick={() => navigator.clipboard.writeText(pixCopyPaste)}
                >
                  Copiar código Pix
                </button>
              </>
            )}

            {paymentProvider === "efibank" ? (
              <p className="checkoutHint">
                Pague o Pix acima no app do seu banco — a confirmação é automática, essa página atualiza sozinha.
              </p>
            ) : (
              <>
                <p className="checkoutHint checkoutMockNote">
                  Modo de teste: a loja ainda não configurou a EfiBank, então não existe um Pix de verdade
                  pra escanear. Use o botão abaixo pra simular a confirmação do pagamento.
                </p>
                <button className="checkoutBtnPrimary" onClick={handleMockConfirm} disabled={submitting}>
                  {submitting ? "Confirmando..." : "Confirmar pagamento (teste)"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
