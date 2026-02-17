"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type ProductImage = { id: number; url: string; position: number };

type Product = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  category_id: number | null;
  images: ProductImage[];
};

type Coupon = {
  code: string;
  active: boolean;
  percent_off: number;
  usage_limit: number;
  used_count: number;
  min_order_value?: number | null;
  expires_at?: string | null;
};

type Similar = {
  id: number;
  slug: string;
  name: string;
  price: number;
  image_url: string | null;
  score: number;
};

export default function ProductPage() {
  const params = useParams<{ slug: string }>();

  const [product, setProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);

  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [finalPrice, setFinalPrice] = useState<number | null>(null);

  const [similar, setSimilar] = useState<Similar[]>([]);
  const similarLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProduct() {
      const slug = params.slug;
      if (!slug) return;

      try {
        const res = await fetch(`/api/products/${encodeURIComponent(slug)}`, { method: "GET" });
        if (!res.ok) {
          setProduct(null)
          if (res.status === 404) {
            setNotFound(true)
          }
          return
        };
        const json = (await res.json()) as { ok?: boolean; data?: unknown };
        if (!json.ok || !json.data || cancelled) return;

        const data = json.data as Product;

        const safeImages = Array.isArray(data.images) ? data.images : [];
        const normalized: Product = { ...data, images: safeImages };

        setProduct(normalized);
        setSelectedImage(0);
        setCouponMessage("");
        setFinalPrice(null);
      } catch {
        if (cancelled) return;
      }
    }

    void loadProduct();

    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  const currentImage = useMemo(() => {
    if (!product) return "/download.jpg";
    const img = product.images?.[selectedImage]?.url;
    return img || "/download.jpg";
  }, [product, selectedImage]);

  useEffect(() => {
    if (!product) return;
    if (!product.category_id) return;

    let cancelled = false;

    async function loadSimilar() {
      if (similarLoadedRef.current) return;
      if (!product) return;
      similarLoadedRef.current = true;

      try {
        const basePrice = Number(product.price);
        const res = await fetch(`/api/products?category=${encodeURIComponent(String(product.category_id))}`, {
          method: "GET",
        });

        if (!res.ok || cancelled) return;

        const json = (await res.json()) as { ok?: boolean; data?: unknown };
        if (!json.ok || cancelled) return;

        const arr = Array.isArray(json.data) ? (json.data as any[]) : [];
        const cleaned = arr
          .filter((item) => item && item.id !== product.id)
          .map((item) => {
            const itemPrice = Number(item.price);
            const acceptable = itemPrice <= basePrice * 1.2;
            const score = (acceptable ? 2 : 1);

            return {
              id: Number(item.id),
              slug: String(item.slug),
              name: String(item.name),
              price: itemPrice,
              image_url: item.image_url ? String(item.image_url) : null,
              score,
            } satisfies Similar;
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);

        setSimilar(cleaned);
      } catch {
        if (cancelled) return;
      }
    }

    function onScroll() {
      if (window.scrollY > 300) void loadSimilar();
    }

    window.addEventListener("scroll", onScroll);
    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onScroll);
    };
  }, [product]);

  async function applyCoupon() {
    if (!product) return;

    setCouponMessage("");
    setFinalPrice(null);

    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponMessage("Digite um cupom");
      return;
    }

    try {
      const res = await fetch("/api/coupons", { method: "GET" });
      if (!res.ok) {
        setCouponMessage("Falha ao validar cupom");
        return;
      }

      const json = (await res.json()) as { ok?: boolean; data?: Coupon[] };
      const list = Array.isArray(json.data) ? json.data : [];

      const coupon = list.find((c) => c.code === code && c.active);

      if (!coupon) {
        setCouponMessage("Cupom inválido");
        return;
      }

      if (coupon.expires_at && new Date(coupon.expires_at) <= new Date()) {
        setCouponMessage("Cupom expirado");
        return;
      }

      if (coupon.usage_limit > 0 && coupon.used_count >= coupon.usage_limit) {
        setCouponMessage("Cupom sem usos restantes");
        return;
      }

      const minValue = Number(coupon.min_order_value ?? 0);
      if (minValue > 0 && Number(product.price) < minValue) {
        setCouponMessage("Valor mínimo para cupom não atingido");
        return;
      }

      const discounted = Number(product.price) * (1 - Number(coupon.percent_off) / 100);
      setFinalPrice(discounted);
      setCouponMessage(`Cupom aplicado: -${coupon.percent_off}%`);
    } catch {
      setCouponMessage("Erro de rede ao validar cupom");
    }
  }

  if (notFound) return <main>Produto não encontrado</main>;
  if (!product) return <main>Carregando...</main>;

  return (
    <main style={{ color: "white", padding: 24, display: "grid", gap: 24 }}>
      <section style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 320px", gap: 16 }}>
        <div>
          <img
            src={currentImage}
            alt={product.name}
            style={{ width: "100%", height: 380, objectFit: "cover", borderRadius: 12 }}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {(Array.isArray(product.images) ? product.images : []).map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedImage(index)}
                aria-label={`Selecionar imagem ${index + 1}`}
                style={{ padding: 0, border: 0, background: "transparent", cursor: "pointer" }}
              >
                <img
                  src={image.url}
                  alt={`${product.name} ${index + 1}`}
                  style={{
                    width: 70,
                    height: 70,
                    objectFit: "cover",
                    borderRadius: 8,
                    outline: index === selectedImage ? "2px solid #777" : "none",
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <h1>{product.name}</h1>
          <p style={{ fontSize: 22 }}>R$ {Number(finalPrice ?? product.price).toFixed(2)}</p>

          <p style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>{product.description || ""}</p>

          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <button type="button">Comprar agora</button>
            <button type="button">Adicionar ao carrinho</button>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value)}
                placeholder="Cupom"
              />
              <button type="button" onClick={() => void applyCoupon()}>
                Aplicar
              </button>
            </div>

            {couponMessage ? <p>{couponMessage}</p> : null}
            {finalPrice !== null ? <p>Preço final: R$ {finalPrice.toFixed(2)}</p> : null}
          </div>
        </div>

        <aside style={{ display: "grid", gap: 12 }}>
          <article style={{ border: "1px solid #333", borderRadius: 12, padding: 12 }}>
            <h3>Compra segura</h3>
            <p>Pagamento criptografado e suporte dedicado.</p>
          </article>

          <article style={{ border: "1px solid #333", borderRadius: 12, padding: 12 }}>
            <h3>Métodos de pagamento</h3>
            <p>Cartão, Pix e boleto.</p>
          </article>
        </aside>
      </section>

      {similar.length > 0 && (
        <section>
          <h2>Produtos similares</h2>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {similar.map((item) => (
              <article key={item.id} style={{ border: "1px solid #333", borderRadius: 12, padding: 10 }}>
                <img
                  src={item.image_url || "/download.jpg"}
                  alt={item.name}
                  style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 10 }}
                />

                <h4 style={{ margin: "10px 0 6px" }}>{item.name}</h4>
                <p style={{ margin: 0 }}>R$ {Number(item.price).toFixed(2)}</p>

                <Link href={`/product/${item.slug}`}>Ver</Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}