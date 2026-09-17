"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./checkout.css";
import ShippingQuoteList, { type ShippingQuote } from "@/app/(components)/shipping/ShippingQuoteList";
import { getDiscountAmount, getDiscountPercent, getNextMilestone, qualifiesForFreeShipping, DEFAULT_PROMOTION_SETTINGS, type PromotionSettings } from "@/lib/pricing/cartDiscount";
import { QRCodeSVG } from "qrcode.react";
import { useModal } from "@/app/(components)/modal/ModalProvider";
import { FiShoppingCart } from "react-icons/fi";

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
  productName?: string;
  product_name?: string;
  variationName?: string | null;
  variation_name?: string | null;
  type: "key" | "file" | "infinite";
  content: string;
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

type Recommendation = {
  id: number;
  slug: string;
  name: string;
  price: number;
  image_url: string | null;
};

type PaymentMethod = "pix" | "credit_card" | "debit_card" | "boleto";

type CheckoutStage = "loading" | "pending_resume" | "review" | "address" | "payment" | "awaiting_payment" | "delivered" | "empty" | "suspended";

type PendingOrderItem = {
  product_name: string;
  variation_name: string | null;
  quantity: number;
  unit_price: number;
  product_type: "digital" | "physical";
};

type PendingOrderPayment = {
  method: PaymentMethod;
  pixCopyPaste: string | null;
  pixQrCodeBase64: string | null;
  boletoUrl: string | null;
  boletoBarcode: string | null;
};

type PendingOrder = {
  orderId: number;
  orderNumber: string | null;
  total: number;
  items: PendingOrderItem[];
  hasNewCartItems: boolean;
  mercadoPagoPublicKey: string | null;
  pendingPayment: PendingOrderPayment | null;
};

// Mesma regra usada na criação do pedido (lib/orders/orderNumber.ts), mas
// reimplementada aqui pra não puxar lib/database/db (pg) pro bundle do
// client — aquele módulo é server-only.
function displayOrderNumber(order: { order_number?: string | null; id: number }) {
  return order.order_number || `LEGADO-${order.id}`;
}

const MP_SDK_SRC = "https://sdk.mercadopago.com/js/v2";

// Cache do carregamento do script em módulo (não por render/efeito) — se
// dois mounts pedissem o script ao mesmo tempo antes do primeiro terminar,
// cada um adicionava sua própria <script> pro SDK, e duas cópias do SDK
// carregando em paralelo podia deixar o `window.MercadoPago` num estado
// inconsistente no meio de uma inicialização de Brick.
let mercadoPagoScriptPromise: Promise<void> | null = null;
function loadMercadoPagoScript(): Promise<void> {
  if ((window as any).MercadoPago) return Promise.resolve();
  if (!mercadoPagoScriptPromise) {
    mercadoPagoScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = MP_SDK_SRC;
      script.onload = () => resolve();
      script.onerror = () => {
        mercadoPagoScriptPromise = null;
        reject(new Error("Falha ao carregar SDK do Mercado Pago"));
      };
      document.body.appendChild(script);
    });
  }
  return mercadoPagoScriptPromise;
}

export default function CheckoutPage() {
  const modal = useModal();
  const [stage, setStage] = useState<CheckoutStage>("loading");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [resumingPending, setResumingPending] = useState(false);
  const [cancellingPending, setCancellingPending] = useState(false);
  const [mergingCart, setMergingCart] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [mercadoPagoPublicKey, setMercadoPagoPublicKey] = useState<string | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);
  const [pixQrCodeBase64, setPixQrCodeBase64] = useState<string | null>(null);
  const [boletoUrl, setBoletoUrl] = useState<string | null>(null);
  const [boletoBarcode, setBoletoBarcode] = useState<string | null>(null);
  const [pendingMethod, setPendingMethod] = useState<PaymentMethod | null>(null);
  const [deliveredItems, setDeliveredItems] = useState<DeliveredItem[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [quoting, setQuoting] = useState(false);
  const [selectedQuoteIndex, setSelectedQuoteIndex] = useState<number | null>(null);

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [addingRecommendation, setAddingRecommendation] = useState<number | null>(null);
  const [removingItem, setRemovingItem] = useState<number | null>(null);

  const [promotionSettings, setPromotionSettings] = useState<PromotionSettings>(DEFAULT_PROMOTION_SETTINGS);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percentOff: number } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  const [customerEmail, setCustomerEmail] = useState<string | null>(null);

  const brickContainerRef = useRef<HTMLDivElement>(null);
  const brickControllerRef = useRef<any>(null);
  // Encadeia toda montagem/desmontagem do Brick numa fila — em dev o React
  // roda o efeito duas vezes (Strict Mode: monta, desmonta, monta de novo)
  // e como bricksBuilder.create é assíncrono, a segunda montagem podia
  // disparar antes da primeira terminar, criando dois Bricks no mesmo
  // container e derrubando com "Bricks.create initialization failed".
  // Serializar aqui garante que uma desmontagem sempre termina antes da
  // próxima montagem começar, em dev e em produção.
  const brickTaskRef = useRef<Promise<void>>(Promise.resolve());

  const hasPhysical = cart.some((item) => item.product_type === "physical");
  const selectedQuote = selectedQuoteIndex !== null ? quotes[selectedQuoteIndex] : null;

  useEffect(() => {
    void init();
    void loadCustomerEmail();
    void loadPromotionSettings();
  }, []);

  // Se já existe um pedido criado (create-order) e ainda não pago, mostra
  // ele em vez de ir direto pro carrinho — o carrinho já foi esvaziado na
  // hora de criar esse pedido, então sem isso o cliente só via um
  // carrinho vazio e não tinha como voltar pro pagamento que abandonou,
  // nem como cancelar; só sobrava comprar tudo de novo e acumular vários
  // pedidos pendentes soltos.
  async function init() {
    const pending = await loadPendingOrder();
    if (pending) {
      // O cliente pode ter fechado a aba logo depois de pagar via Pix/
      // boleto, antes da confirmação chegar — checa ativamente com o
      // Mercado Pago antes de mostrar "cancelar ou continuar", senão um
      // pedido já pago apareceria como se ainda estivesse por pagar.
      try {
        const checkRes = await fetch(`/api/checkout/order/${pending.orderId}/check-payment`, { method: "POST" });
        const checkJson = await checkRes.json();
        if (checkRes.ok && (checkJson.data?.status === "paid" || checkJson.data?.status === "delivered")) {
          await loadDeliveredOrder(pending.orderId);
          return;
        }
      } catch {
        // se a checagem falhar, mostra a tela de retomar normalmente
      }
      setStage("pending_resume");
      return;
    }
    await loadCart();
  }

  async function loadDeliveredOrder(id: number) {
    const res = await fetch(`/api/checkout/order/${id}`, { cache: "no-store" });
    const json = await res.json();
    if (res.ok) {
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
      setOrderId(id);
      setOrderNumber(json.data.order_number ?? null);
      setDeliveredItems(delivered);
      setStage("delivered");
    } else {
      setStage("pending_resume");
    }
  }

  async function loadPendingOrder(): Promise<PendingOrder | null> {
    try {
      const res = await fetch("/api/checkout/pending-order", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) {
        setPendingOrder(json.data);
        return json.data;
      }
    } catch {
      // se falhar, segue o fluxo normal (carrinho) em vez de travar o checkout
    }
    setPendingOrder(null);
    return null;
  }

  function resumePendingPayment() {
    if (!pendingOrder) return;
    setResumingPending(true);
    setOrderId(pendingOrder.orderId);
    setOrderNumber(pendingOrder.orderNumber);

    // Já existe uma cobrança Pix/boleto pendente — mostra ela de novo em
    // vez de reabrir a escolha de método do zero (o que geraria uma
    // segunda cobrança e faria o polling olhar pra transação errada).
    if (pendingOrder.pendingPayment) {
      const pp = pendingOrder.pendingPayment;
      setPendingMethod(pp.method);
      setPixCopyPaste(pp.pixCopyPaste);
      setPixQrCodeBase64(pp.pixQrCodeBase64);
      setBoletoUrl(pp.boletoUrl);
      setBoletoBarcode(pp.boletoBarcode);
      setStage("awaiting_payment");
    } else {
      setMercadoPagoPublicKey(pendingOrder.mercadoPagoPublicKey);
      setStage("payment");
    }
    setResumingPending(false);
  }

  async function cancelPendingOrder() {
    if (!pendingOrder) return;
    if (!(await modal.confirm(`Cancelar o pedido ${displayOrderNumber({ order_number: pendingOrder.orderNumber, id: pendingOrder.orderId })}?`, { danger: true }))) return;
    setCancellingPending(true);
    try {
      const res = await fetch(`/api/checkout/order/${pendingOrder.orderId}/cancel`, { method: "PATCH" });
      if (res.ok) {
        setPendingOrder(null);
        await loadCart();
      } else {
        setErrorMessage("Não foi possível cancelar o pedido. Tente novamente.");
      }
    } finally {
      setCancellingPending(false);
    }
  }

  async function mergeCartIntoPending() {
    if (!pendingOrder) return;
    setMergingCart(true);
    setErrorMessage("");
    try {
      const res = await fetch(`/api/checkout/order/${pendingOrder.orderId}/add-items`, { method: "POST" });
      if (res.ok) {
        await loadPendingOrder();
      } else {
        setErrorMessage("Não foi possível adicionar os itens ao pedido. Tente novamente.");
      }
    } finally {
      setMergingCart(false);
    }
  }

  async function loadPromotionSettings() {
    try {
      const res = await fetch("/api/checkout/promotion-settings", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) setPromotionSettings(json.data);
    } catch {
      // fica no default (mesmos valores hoje configurados como padrão da loja)
    }
  }

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setApplyingCoupon(true);
    setCouponError("");
    try {
      const res = await fetch(`/api/coupons?code=${encodeURIComponent(code)}`);
      const json = await res.json();
      if (res.ok && json.data) {
        if (json.data.min_order_value && subtotal < Number(json.data.min_order_value)) {
          setCouponError(
            `Esse cupom vale só a partir de R$ ${Number(json.data.min_order_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`
          );
          return;
        }
        setAppliedCoupon({ code: json.data.code, percentOff: Number(json.data.percent_off) });
        setCouponCode("");
      } else {
        setCouponError("Cupom inválido ou expirado.");
      }
    } catch {
      setCouponError("Não foi possível validar o cupom agora.");
    } finally {
      setApplyingCoupon(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponError("");
  }

  // O Payment Brick usa payer.email na inicialização — sem isso, alguns
  // métodos (boleto/Pix) podem falhar ou pedir o dado de novo no meio do
  // formulário. Busca uma vez, silenciosamente (se falhar, o Brick ainda
  // funciona, só sem pré-preencher).
  async function loadCustomerEmail() {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data?.email) setCustomerEmail(json.data.email);
    } catch {
      // opcional — Brick funciona sem isso também
    }
  }

  async function loadCart() {
    const res = await fetch("/api/cart", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok && json.error === "STORE_SUSPENDED") {
      setStage("suspended");
      return;
    }
    const items: CartItem[] = res.ok && Array.isArray(json.data) ? json.data : [];
    setCart(items);
    setStage(items.length === 0 ? "empty" : "review");
    if (items.length > 0) void loadRecommendations();
  }

  async function loadRecommendations() {
    try {
      const res = await fetch("/api/checkout/recommendations", { cache: "no-store" });
      const json = await res.json();
      setRecommendations(res.ok && Array.isArray(json.data) ? json.data : []);
    } catch {
      // cross-sell é só um empurrão a mais — falhar aqui não pode travar o checkout
    }
  }

  async function addRecommendation(productId: number) {
    setAddingRecommendation(productId);
    try {
      const res = await fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, variation_id: null, quantity: 1 }),
      });
      if (res.ok) {
        setRecommendations((prev) => prev.filter((r) => r.id !== productId));
        await loadCart();
      }
    } finally {
      setAddingRecommendation(null);
    }
  }

  async function removeCartItem(cartItemId: number) {
    setRemovingItem(cartItemId);
    setErrorMessage("");
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart_item_id: cartItemId, quantity: 0 }),
      });
      if (res.ok) {
        await loadCart();
      } else {
        setErrorMessage("Não foi possível remover esse item. Tente novamente.");
      }
    } catch {
      setErrorMessage("Não foi possível remover esse item. Tente novamente.");
    } finally {
      setRemovingItem(null);
    }
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
  const tierDiscount = getDiscountAmount(subtotal, promotionSettings.discountTiers);
  const tierDiscountPercent = getDiscountPercent(subtotal, promotionSettings.discountTiers);
  const couponDiscount = appliedCoupon ? Math.round(subtotal * (appliedCoupon.percentOff / 100) * 100) / 100 : 0;
  // Cupom e desconto automático não se empilham — mesma regra do servidor
  // (create-order): usa o que for melhor pro cliente.
  const usingCoupon = appliedCoupon !== null && couponDiscount > tierDiscount;
  const discount = usingCoupon ? couponDiscount : tierDiscount;
  const discountPercent = usingCoupon ? appliedCoupon!.percentOff : tierDiscountPercent;
  const freeShippingUnlocked = qualifiesForFreeShipping(subtotal, promotionSettings);
  const rawShippingFee = selectedQuote?.price ?? 0;
  const shippingFee = freeShippingUnlocked ? 0 : rawShippingFee;
  const total = Math.round((subtotal - discount + shippingFee) * 100) / 100;
  const nextMilestone = getNextMilestone(subtotal, promotionSettings);
  // Ao retomar um pedido pendente, o carrinho fica vazio (foi consumido
  // quando o pedido original foi criado) — `total` (calculado a partir do
  // carrinho) ficaria 0 nesse caso. O valor de verdade é o que já está
  // gravado no pedido.
  const isResumedOrder = pendingOrder !== null && orderId === pendingOrder.orderId;
  const paymentAmount = isResumedOrder ? pendingOrder.total : total;

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
        body: JSON.stringify({ shipping: shippingPayload, couponCode: usingCoupon ? appliedCoupon?.code : undefined }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.error === "STORE_SUSPENDED") {
          setStage("suspended");
        } else if (String(json.error).startsWith("OUT_OF_STOCK")) {
          setErrorMessage(`Item esgotado: ${String(json.error).split(":")[1] ?? ""}`);
        } else if (json.error === "MISSING_SHIPPING_ADDRESS" || json.error === "MISSING_SHIPPING_QUOTE") {
          setErrorMessage("Preencha o endereço e escolha uma opção de frete.");
        } else if (json.error === "EMPTY_CART") {
          setErrorMessage("Seu carrinho está vazio.");
        } else if (String(json.error).startsWith("MIN_ORDER_VALUE")) {
          const min = String(json.error).split(":")[1];
          setErrorMessage(`Pedido mínimo de R$ ${Number(min).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`);
        } else if (json.error === "INVALID_COUPON") {
          setErrorMessage("Esse cupom não é mais válido. Remova-o e tente novamente.");
          setAppliedCoupon(null);
        } else if (String(json.error).startsWith("COUPON_MIN_ORDER_VALUE")) {
          setErrorMessage("O carrinho não atinge mais o valor mínimo desse cupom.");
          setAppliedCoupon(null);
        } else {
          setErrorMessage("Não deu pra criar o pedido. Tente novamente.");
        }
        return;
      }

      setOrderId(json.data.orderId);
      setOrderNumber(json.data.orderNumber ?? null);
      setMercadoPagoPublicKey(json.data.mercadoPagoPublicKey ?? null);
      setStage("payment");
    } finally {
      setSubmitting(false);
    }
  }

  // Sem credencial do Mercado Pago configurada (modo mock) — monta o Brick
  // de verdade só quando tem publicKey; senão a tela mostra os botões de
  // método simples (mock).
  useEffect(() => {
    if (stage !== "payment" || !mercadoPagoPublicKey || !orderId) return;

    // Chave pública com formato errado é a causa mais comum de
    // "Bricks.create initialization failed" — normalmente é confundir
    // MERCADO_PAGO_PUBLIC_KEY com o access token no .env. Falha cedo, com
    // uma mensagem que dá pra debugar, em vez de deixar o SDK explodir com
    // um erro genérico.
    if (!/^(APP_USR|TEST)-/.test(mercadoPagoPublicKey)) {
      console.error("Public key do Mercado Pago não parece válida:", mercadoPagoPublicKey);
      setErrorMessage(
        "Configuração do Mercado Pago inválida (public key). Confira MERCADO_PAGO_PUBLIC_KEY no .env — " +
        "não deve ser o mesmo valor do access token."
      );
      return;
    }

    if (!(paymentAmount > 0)) {
      console.error("Valor do pedido inválido pro Payment Brick:", paymentAmount);
      setErrorMessage("Valor do pedido inválido. Volte pro carrinho e tente de novo.");
      return;
    }

    let cancelled = false;

    // ID novo a CADA TENTATIVA (não o fixo "mpPaymentBrickContainer",
    // reaproveitado por todas) — como os dois métodos (todos os 4, depois
    // só cartão) falharam igual um atrás do outro, suspeita forte é que o
    // SDK guarda estado interno preso ao ID/elemento do container (algum
    // registro global da lib de UI que ele usa por baixo), então uma 2ª
    // tentativa no MESMO id herdava a falha da 1ª mesmo com innerHTML
    // limpo. Cada chamada de createBrick pede um ID nunca usado antes.
    let containerIdCounter = 0;
    function nextContainerId() {
      containerIdCounter += 1;
      return `mpPaymentBrickContainer-${Date.now()}-${containerIdCounter}`;
    }

    function onSubmit({ selectedPaymentMethod, formData }: any) {
      const method: PaymentMethod =
        selectedPaymentMethod === "bank_transfer" ? "pix" :
        selectedPaymentMethod === "ticket" ? "boleto" :
        selectedPaymentMethod === "debit_card" ? "debit_card" : "credit_card";
      return submitPayment(method, formData);
    }

    // O Brick recusa a inicialização inteira sem isso — "Callbacks onReady
    // and/or onError are required". Não faz nada além de existir; o Brick
    // já cuida do próprio estado de carregamento visualmente.
    function onBrickReady() {}

    function onBrickError(error: unknown) {
      console.error("Erro no Payment Brick:", error);
      setErrorMessage("Erro no formulário de pagamento. Tente novamente.");
    }

    async function createBrick(mp: any, paymentMethods: Record<string, string>) {
      // `payer` só entra no objeto quando existe email — um `payer: undefined`
      // explícito (em vez de omitir a chave) já foi visto derrubando a
      // validação de outros SDKs de forma parecida a essa.
      const initialization: Record<string, unknown> = { amount: paymentAmount };
      if (customerEmail) initialization.payer = { email: customerEmail };

      if (!brickContainerRef.current) throw new Error("Container do Brick sumiu do DOM.");
      const id = nextContainerId();
      brickContainerRef.current.id = id;

      return mp.bricks().create("payment", id, {
        initialization,
        customization: { paymentMethods },
        callbacks: { onReady: onBrickReady, onSubmit, onError: onBrickError },
      });
    }


    function describeError(err: unknown) {
      if (err instanceof Error) {
        return { message: err.message, name: err.name, stack: err.stack, cause: (err as any).cause };
      }
      try {
        return JSON.parse(JSON.stringify(err));
      } catch {
        return String(err);
      }
    }

    // O SDK do Mercado Pago chama console.error() internamente assim que
    // Bricks.create falha — ANTES da nossa Promise sequer rejeitar. Em dev,
    // o Next.js mostra isso como um overlay "Console Error" vermelho, mesmo
    // quando a gente já trata a falha logo em seguida com o fallback só-
    // cartão (que costuma funcionar normalmente). Silencia só esse log
    // interno do SDK durante a 1ª tentativa — se o fallback TAMBÉM falhar,
    // isso não é mais esperado, então o console.error volta a aparecer.
    async function createBrickQuietly(mp: any, paymentMethods: Record<string, string>) {
      const originalConsoleError = console.error;
      console.error = () => {};
      try {
        return await createBrick(mp, paymentMethods);
      } finally {
        console.error = originalConsoleError;
      }
    }

    async function mount() {
      await loadMercadoPagoScript();
      if (cancelled || !brickContainerRef.current) return;

      // Limpa qualquer resquício de uma montagem anterior antes de criar
      // uma nova no mesmo container.
      brickContainerRef.current.innerHTML = "";

      const mp = new (window as any).MercadoPago(mercadoPagoPublicKey, { locale: "pt-BR" });

      let controller;
      try {
        controller = await createBrickQuietly(mp, { creditCard: "all", debitCard: "all", ticket: "all", bankTransfer: "all" });
      } catch (fullErr) {
        // Conta real que ainda não habilitou Pix/boleto no painel do
        // Mercado Pago derruba a inicialização inteira pedindo todos os 4
        // métodos de uma vez — tenta de novo só com cartão (todo mundo
        // tem isso liberado) antes de desistir de vez.
        console.warn("Brick com todos os métodos falhou, tentando só cartão. Detalhe:", describeError(fullErr));
        if (cancelled || !brickContainerRef.current) return;
        brickContainerRef.current.innerHTML = "";
        try {
          controller = await createBrick(mp, { creditCard: "all", debitCard: "all" });
          if (!cancelled) {
            setErrorMessage(
              "Pix e boleto não estão disponíveis agora (verifique se estão habilitados na sua conta Mercado Pago). " +
              "Cartão de crédito/débito continua funcionando normalmente."
            );
          }
        } catch (fallbackErr) {
          console.error("Falha também no fallback só-cartão. Detalhe:", describeError(fallbackErr));
          throw fallbackErr;
        }
      }

      if (cancelled) {
        // O efeito foi limpo enquanto a criação estava em andamento (comum
        // em dev, Strict Mode) — desmonta na hora em vez de deixar órfão.
        controller?.unmount?.();
        return;
      }
      brickControllerRef.current = controller;
    }

    brickTaskRef.current = brickTaskRef.current
      .catch(() => {})
      .then(mount)
      .catch((err) => {
        console.error("Erro ao montar Payment Brick:", err);
        if (!cancelled) {
          setErrorMessage(
            "Não foi possível carregar o formulário de pagamento. Verifique se as credenciais do Mercado Pago " +
            "(.env) estão corretas e se a conta está ativa, e recarregue a página."
          );
        }
      });

    return () => {
      cancelled = true;
      brickTaskRef.current = brickTaskRef.current
        .then(() => {
          brickControllerRef.current?.unmount?.();
          brickControllerRef.current = null;
        })
        .catch(() => {});
    };
  }, [stage, mercadoPagoPublicKey, orderId]);

  async function submitPayment(method: PaymentMethod, formData?: Record<string, unknown>) {
    if (!orderId) return;
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch(`/api/checkout/pay/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, formData }),
      });
      const json = await res.json();

      if (!res.ok) {
        setErrorMessage(
          json.error === "PAYMENT_PROVIDER_ERROR"
            ? "O Mercado Pago não conseguiu processar esse pagamento agora. Tente novamente em instantes."
            : "Não deu pra processar o pagamento. Tente novamente."
        );
        return;
      }

      if (json.data.status === "paid") {
        setDeliveredItems(json.data.deliveredItems ?? []);
        setStage("delivered");
      } else if (json.data.status === "failed") {
        setErrorMessage(json.data.failureReason || "Pagamento recusado. Tente outro método ou outro cartão.");
      } else {
        setPendingMethod(method);
        setPixCopyPaste(json.data.pixCopyPaste ?? null);
        setPixQrCodeBase64(json.data.pixQrCodeBase64 ?? null);
        setBoletoUrl(json.data.boletoUrl ?? null);
        setBoletoBarcode(json.data.boletoBarcode ?? null);
        setStage("awaiting_payment");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Pix/boleto ficam pendentes até o pagamento cair de verdade. Não
  // depende só do webhook do Mercado Pago pra saber disso — a cada
  // intervalo, pergunta ATIVAMENTE pro Mercado Pago se já pagou
  // (check-payment, mesma checagem que o webhook faria), então busca os
  // detalhes/entrega. Assim funciona mesmo se o webhook falhar por
  // qualquer motivo (túnel de dev fora do ar, etc.) — quem confirma não é
  // só o Mercado Pago nos chamando de volta, é a própria tela perguntando.
  useEffect(() => {
    if (stage !== "awaiting_payment" || !orderId) return;

    const interval = setInterval(async () => {
      let confirmedStatus: string | null = null;
      try {
        const checkRes = await fetch(`/api/checkout/order/${orderId}/check-payment`, { method: "POST" });
        const checkJson = await checkRes.json();
        if (checkRes.ok) confirmedStatus = checkJson.data?.status ?? null;
      } catch {
        // se a checagem ativa falhar (rede etc.), tenta de novo no próximo intervalo
      }

      if (confirmedStatus === "paid" || confirmedStatus === "delivered") {
        await loadDeliveredOrder(orderId);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [stage, orderId]);

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

  if (stage === "pending_resume" && pendingOrder) {
    return (
      <main className="checkoutPage">
        <div className="checkoutCard">
          <h1>Você tem um pedido em aberto</h1>
          <p className="checkoutHint">
            Pedido {displayOrderNumber({ order_number: pendingOrder.orderNumber, id: pendingOrder.orderId })} foi criado mas ainda não foi pago. Continue o pagamento, cancele, ou
            adicione mais itens antes de fechar.
          </p>

          <div className="checkoutItems">
            {pendingOrder.items.map((item, i) => (
              <div key={i} className="checkoutItem">
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
            <span>Total</span>
            <strong>R$ {pendingOrder.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
          </div>

          {errorMessage && <p className="checkoutError">{errorMessage}</p>}

          {pendingOrder.hasNewCartItems && (
            <button className="checkoutBtnSecondary" onClick={mergeCartIntoPending} disabled={mergingCart}>
              {mergingCart ? "Adicionando..." : "+ Adicionar itens do carrinho a esse pedido"}
            </button>
          )}

          <button className="checkoutBtnPrimary" onClick={resumePendingPayment} disabled={resumingPending}>
            Continuar para pagamento
          </button>

          <button className="checkoutBtnSecondary checkoutCancelPendingBtn" onClick={cancelPendingOrder} disabled={cancellingPending}>
            {cancellingPending ? "Cancelando..." : "Cancelar esse pedido"}
          </button>

          {!pendingOrder.hasNewCartItems && (
            <Link href="/" className="checkoutHint checkoutContinueShoppingLink">Continuar comprando</Link>
          )}
        </div>
      </main>
    );
  }

  if (stage === "suspended") {
    return (
      <main className="checkoutPage">
        <div className="checkoutCard">
          <h1>Loja temporariamente indisponível</h1>
          <p className="checkoutHint">Não estamos processando compras no momento. Tente novamente mais tarde.</p>
          <Link href="/" className="checkoutBtnPrimary">Voltar à loja</Link>
        </div>
      </main>
    );
  }

  if (stage === "empty") {
    return (
      <main className="checkoutPage">
        <div className="checkoutCard checkoutEmptyState">
          <span className="checkoutEmptyIcon">
            <FiShoppingCart size={32} />
          </span>
          <h1>Seu carrinho está vazio</h1>
          <p className="checkoutHint">Adicione produtos ao carrinho para continuar com a compra.</p>
          <Link href="/" className="checkoutBtnPrimary">Continuar comprando</Link>
        </div>
      </main>
    );
  }

  if (stage === "delivered") {
    return (
      <main className="checkoutPage">
        <div className="checkoutCard">
          <h1>Pedido {displayOrderNumber({ order_number: orderNumber, id: orderId ?? 0 })} confirmado 🎉</h1>
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
                  <strong>
                    {(item.variationName ?? item.variation_name)
                      ? `${item.productName ?? item.product_name} — ${item.variationName ?? item.variation_name}`
                      : (item.productName ?? item.product_name)}
                  </strong>
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

          <ShippingQuoteList
            quotes={quotes}
            selectedIndex={selectedQuoteIndex}
            onSelect={setSelectedQuoteIndex}
          />

          {selectedQuote && freeShippingUnlocked && (
            <p className="checkoutFreeShippingBadge">
              🚚 Frete grátis aplicado! <span className="checkoutStrikePrice">R$ {rawShippingFee.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </p>
          )}

          <div className="checkoutTotalsBlock">
            <div className="checkoutTotalLine">
              <span>Subtotal</span>
              <span>R$ {subtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
            {discount > 0 && (
              <div className="checkoutTotalLine checkoutDiscountLine">
                <span>Desconto ({discountPercent}%){usingCoupon ? ` — cupom ${appliedCoupon?.code}` : ""}</span>
                <span>- R$ {discount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="checkoutTotalLine">
              <span>Frete</span>
              <span>{freeShippingUnlocked ? "Grátis" : `R$ ${shippingFee.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}</span>
            </div>
            <div className="checkoutTotal">
              <span>Total</span>
              <strong>R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>

          <button
            className="checkoutBtnPrimary"
            onClick={handleCreateOrder}
            disabled={!selectedQuote || submitting}
          >
            {submitting ? "Criando pedido..." : "Continuar para pagamento"}
          </button>
        </div>
      </main>
    );
  }

  if (stage === "payment") {
    return (
      <main className="checkoutPage">
        <div className="checkoutCard">
          <h1>Pagamento</h1>
          <div className="checkoutTotal">
            <span>Total</span>
            <strong>R$ {paymentAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
          </div>

          {errorMessage && <p className="checkoutError">{errorMessage}</p>}

          {mercadoPagoPublicKey ? (
            <div id="mpPaymentBrickContainer" ref={brickContainerRef} />
          ) : (
            <div className="checkoutMockPaymentMethods">
              <p className="checkoutHint checkoutMockNote">
                Modo de teste: a loja ainda não configurou o Mercado Pago. Escolha um método pra simular.
              </p>
              <button className="checkoutBtnPrimary" disabled={submitting} onClick={() => submitPayment("pix")}>Pix</button>
              <button className="checkoutBtnPrimary" disabled={submitting} onClick={() => submitPayment("credit_card")}>Cartão de crédito</button>
              <button className="checkoutBtnPrimary" disabled={submitting} onClick={() => submitPayment("debit_card")}>Cartão de débito</button>
              <button className="checkoutBtnPrimary" disabled={submitting} onClick={() => submitPayment("boleto")}>Boleto</button>
            </div>
          )}
        </div>
      </main>
    );
  }

  if (stage === "awaiting_payment") {
    return (
      <main className="checkoutPage">
        <div className="checkoutCard">
          <h1>Pedido {displayOrderNumber({ order_number: orderNumber, id: orderId ?? 0 })} criado</h1>
          <div className="checkoutPixBox">
            {pendingMethod === "boleto" ? (
              <>
                <p className="checkoutHint">Aguardando pagamento do boleto.</p>
                {boletoBarcode && <code className="checkoutPixCode">{boletoBarcode}</code>}
                {boletoUrl && (
                  <a href={boletoUrl} target="_blank" rel="noopener noreferrer" className="checkoutBtnSecondary">
                    Abrir boleto
                  </a>
                )}
              </>
            ) : (
              <>
                <p className="checkoutHint">Aguardando pagamento do Pix.</p>
                {pixQrCodeBase64 ? (
                  <img
                    className="checkoutPixQr"
                    src={`data:image/png;base64,${pixQrCodeBase64}`}
                    alt="QR code Pix"
                  />
                ) : (
                  // O Mercado Pago às vezes não devolve a imagem pronta
                  // (qr_code_base64) mesmo com o código copia-e-cola
                  // presente — gera o QR aqui mesmo a partir do código,
                  // que é um payload Pix padrão (EMV), então qualquer
                  // leitor de QR válido lê igual.
                  pixCopyPaste && (
                    <div className="checkoutPixQr checkoutPixQrGenerated">
                      {/* marginSize=4 é a "zona de silêncio" exigida pela
                          especificação do QR — sem margem suficiente ao
                          redor dos módulos, leitor de banco recusa como
                          inválido mesmo com o conteúdo correto. level="L"
                          (menor correção de erro) mantém a densidade baixa,
                          importante pra um payload Pix longo continuar
                          legível numa câmera de celular. */}
                      <QRCodeSVG value={pixCopyPaste} size={240} level="L" marginSize={4} />
                    </div>
                  )
                )}
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
              </>
            )}

            {mercadoPagoPublicKey ? (
              <p className="checkoutHint">A confirmação é automática — essa página atualiza sozinha assim que cair.</p>
            ) : (
              <>
                <p className="checkoutHint checkoutMockNote">
                  Modo de teste: use o botão abaixo pra simular a confirmação do pagamento.
                </p>
                <button className="checkoutBtnPrimary" onClick={handleMockConfirm} disabled={submitting}>
                  {submitting ? "Confirmando..." : "Confirmar pagamento (teste)"}
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  const milestoneProgress = nextMilestone
    ? Math.min(100, (subtotal / (subtotal + nextMilestone.amountNeeded)) * 100)
    : 100;

  return (
    <main className="checkoutPage">
      <div className="checkoutCard">
        <h1>Finalizar compra</h1>

        {nextMilestone ? (
          <div className="checkoutMilestone">
            <p className="checkoutMilestoneText">
              Faltam <strong>R$ {nextMilestone.amountNeeded.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong> para
              você ganhar <strong>{nextMilestone.label}</strong> 🎁
            </p>
            <div className="checkoutMilestoneBar">
              <div className="checkoutMilestoneBarFill" style={{ width: `${milestoneProgress}%` }} />
            </div>
          </div>
        ) : discountPercent > 0 || freeShippingUnlocked ? (
          <p className="checkoutMilestoneDone">
            🎉 Você desbloqueou{discountPercent > 0 ? ` ${discountPercent}% de desconto` : ""}
            {discountPercent > 0 && freeShippingUnlocked ? " e" : ""}
            {freeShippingUnlocked ? " frete grátis" : ""}!
          </p>
        ) : null}

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
              <button
                type="button"
                className="checkoutItemRemove"
                onClick={() => removeCartItem(item.cart_item_id)}
                disabled={removingItem === item.cart_item_id}
                aria-label={`Remover ${item.product_name}`}
                title="Remover item"
              >
                {removingItem === item.cart_item_id ? "…" : "✕"}
              </button>
            </div>
          ))}
        </div>

        {recommendations.length > 0 && (
          <div className="checkoutRecommendations">
            <p className="checkoutRecommendationsTitle">✨ Que tal adicionar também?</p>
            <div className="checkoutRecommendationsRow">
              {recommendations.map((r) => (
                <div key={r.id} className="checkoutRecommendationCard">
                  <img src={r.image_url || "/file.svg"} alt={r.name} />
                  <span className="checkoutRecommendationName">{r.name}</span>
                  <span className="checkoutRecommendationPrice">
                    R$ {Number(r.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                  <button
                    type="button"
                    className="checkoutRecommendationBtn"
                    onClick={() => addRecommendation(r.id)}
                    disabled={addingRecommendation === r.id}
                  >
                    {addingRecommendation === r.id ? "Adicionando..." : "+ Adicionar"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="checkoutCouponBox">
          {appliedCoupon ? (
            <div className="checkoutCouponApplied">
              <span>🎟️ Cupom <strong>{appliedCoupon.code}</strong> aplicado ({appliedCoupon.percentOff}% off){!usingCoupon && " — desconto automático já é melhor"}</span>
              <button type="button" onClick={removeCoupon}>Remover</button>
            </div>
          ) : (
            <div className="checkoutCouponRow">
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyCoupon(); } }}
                placeholder="Cupom de desconto"
                className="checkoutCouponInput"
              />
              <button type="button" className="checkoutBtnSecondary" onClick={applyCoupon} disabled={applyingCoupon || !couponCode.trim()}>
                {applyingCoupon ? "Validando..." : "Aplicar"}
              </button>
            </div>
          )}
          {couponError && <p className="checkoutError">{couponError}</p>}
        </div>

        <div className="checkoutTotalsBlock">
          <div className="checkoutTotalLine">
            <span>Subtotal</span>
            <span>R$ {subtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </div>
          {discount > 0 && (
            <div className="checkoutTotalLine checkoutDiscountLine">
              <span>Desconto ({discountPercent}%){usingCoupon ? ` — cupom ${appliedCoupon?.code}` : ""}</span>
              <span>- R$ {discount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="checkoutTotal">
            <span>{hasPhysical ? "Total (frete calculado a seguir)" : "Total"}</span>
            <strong>R$ {(subtotal - discount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
          </div>
        </div>

        {errorMessage && <p className="checkoutError">{errorMessage}</p>}

        <button
          className="checkoutBtnPrimary"
          onClick={hasPhysical ? goToAddressStep : handleCreateOrder}
          disabled={submitting}
        >
          {hasPhysical ? "Continuar para entrega" : submitting ? "Criando pedido..." : "Continuar para pagamento"}
        </button>
      </div>
    </main>
  );
}
