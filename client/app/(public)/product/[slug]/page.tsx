"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Product = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  category_id: number | null;
  images: Array<{ id: number; url: string; position: number }>;
};

type Similar = { id: number; slug: string; name: string; price: number; image_url: string | null; has_discount: boolean };

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [similar, setSimilar] = useState<Similar[]>([]);

  useEffect(() => {
    async function load() {
      const slug = params.slug;
      if (!slug) return;
      const prodRes = await fetch(`/api/products/${slug}`);
      const prodJson = await prodRes.json();
      if (prodJson.ok && prodJson.data) {
        setProduct(prodJson.data as Product);
      }
    }
    void load();
  }, [params.slug]);

  useEffect(() => {
    if (!product) return;
    let cancelled = false;

    async function loadSimilar() {
      const [res, couponsRes] = await Promise.all([
        fetch(`/api/products?category=${product.category_id ?? ""}`),
        fetch("/api/coupons"),
      ]);
      const json = await res.json();
      const couponsJson = await couponsRes.json();
      if (!json.ok || !Array.isArray(json.data) || cancelled) return;

      const hasActiveDiscount = Array.isArray(couponsJson.data)
        ? couponsJson.data.some((coupon: { active?: boolean; expires_at?: string | null }) => coupon.active && (!coupon.expires_at || new Date(coupon.expires_at) > new Date()))
        : false;

      const basePrice = Number(product.price);
      const ranked = (json.data as Array<{ id: number; slug: string; name: string; price: number; image_url?: string | null }>).filter((item) => item.id !== product.id)
        .map((item) => {
          const itemPrice = Number(item.price);
          const acceptable = itemPrice <= basePrice * 1.2;
          const discountScore = hasActiveDiscount ? 3 : 0;
          return {
            ...item,
            image_url: item.image_url ?? null,
            has_discount: hasActiveDiscount,
            score: discountScore + (acceptable ? 2 : 1),
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      setSimilar(ranked.map((item) => ({ id: item.id, slug: item.slug, name: item.name, price: item.price, image_url: item.image_url, has_discount: item.has_discount })));
    }

    function onScroll() {
      if (window.scrollY > 300) {
        void loadSimilar();
        window.removeEventListener("scroll", onScroll);
      }
    }

    window.addEventListener("scroll", onScroll);
    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onScroll);
    };
  }, [product]);

  const currentImage = useMemo(() => product?.images?.[selectedImage]?.url || "/download.jpg", [product, selectedImage]);

  async function applyCoupon() {
    if (!product) return;
    const res = await fetch("/api/coupons");
    const json = await res.json();
    if (!json.ok || !Array.isArray(json.data)) return;

    const coupon = json.data.find((item: { code: string; active: boolean; percent_off: number; usage_limit: number; used_count: number; min_order_value?: number | null }) =>
      item.code === couponCode.toUpperCase() && item.active
    );

    if (!coupon) {
      setCouponMessage("Cupom inválido");
      setFinalPrice(null);
      return;
    }

    if (coupon.usage_limit > 0 && coupon.used_count >= coupon.usage_limit) {
      setCouponMessage("Cupom sem usos restantes");
      setFinalPrice(null);
      return;
    }

    const minValue = Number(coupon.min_order_value ?? 0);
    if (minValue > 0 && Number(product.price) < minValue) {
      setCouponMessage("Valor mínimo para cupom não atingido");
      setFinalPrice(null);
      return;
    }

    const discounted = Number(product.price) * (1 - Number(coupon.percent_off) / 100);
    setFinalPrice(discounted);
    setCouponMessage(`Cupom aplicado: -${coupon.percent_off}%`);
  }

  if (!product) return <main style={{ color: "white", padding: 24 }}>Carregando...</main>;

  return (
    <main style={{ color: "white", padding: 24, display: "grid", gap: 24 }}>
      <section style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 320px", gap: 16 }}>
        <div>
          <img src={currentImage} alt={product.name} style={{ width: "100%", height: 380, objectFit: "cover", borderRadius: 12 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {product.images.map((image, index) => (
              <button key={image.id} type="button" onClick={() => setSelectedImage(index)} aria-label={`Selecionar imagem ${index + 1}`}>
                <img src={image.url} alt={`${product.name} ${index + 1}`} style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 8 }} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <h1>{product.name}</h1>
          <p style={{ fontSize: 22 }}>R$ {Number(product.price).toFixed(2)}</p>
          <textarea readOnly value={product.description || ""} style={{ width: "100%", minHeight: 120 }} />
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <button type="button">Comprar agora</button>
            <button type="button">Adicionar ao carrinho</button>
          </div>
          <div style={{ marginTop: 12 }}>
            <input value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Cupom" />
            <button type="button" onClick={() => void applyCoupon()}>Aplicar</button>
            {couponMessage ? <p>{couponMessage}</p> : null}
            {finalPrice ? <p>Preço final: R$ {finalPrice.toFixed(2)}</p> : null}
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image_url || "/download.jpg"} alt={item.name} style={{ width: "100%", height: 130, objectFit: "cover" }} />
                <h4>{item.name}</h4>
                <p>R$ {Number(item.price).toFixed(2)}</p>
                <Link href={`/product/${item.slug}`}>Ver</Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
