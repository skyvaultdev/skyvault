"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import "./product.css";
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

type Variations = {
  product_id: number;
  name: string;
  price: number;
  position: number;
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
  const [variations, setVariations] = useState<Variations[]>([]);
  const [selectedVariationPos, setSelectedVariationPos] = useState<number | null>(null);

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
          if (!cancelled) {
            setProduct(null);
            if (res.status === 404) setNotFound(true);
          }
          return;
        }

        const json = (await res.json()) as { ok?: boolean; data?: unknown };
        if (!json.ok || !json.data || cancelled) return;

        const data = json.data as Product;
        const safeImages = Array.isArray(data.images) ? data.images : [];
        const normalized: Product = { ...data, images: safeImages };

        if (!cancelled) {
          setProduct(normalized);
          setSelectedImage(0);
          setCouponMessage("");
          setFinalPrice(null);
          setVariations([]);
          setSelectedVariationPos(null);

          similarLoadedRef.current = false;
          setSimilar([]);
          setNotFound(false);
        }
      } catch {
        // ignore
      }
    }

    void loadProduct();

    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  useEffect(() => {
    let cancelled = false;

    async function loadVariations() {
      if (!product?.id) return;

      try {
        const res = await fetch(`/api/products/variations/${encodeURIComponent(String(product.id))}`, {
          method: "GET",
        });

        if (!res.ok) {
          if (!cancelled) setVariations([]);
          return;
        }

        const json = (await res.json()) as { ok?: boolean; data?: unknown };
        if (!json.ok || cancelled) return;

        const raw = json.data;
        const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];

        const cleaned = (list as Variations[])
          .map((v) => ({
            product_id: Number(v.product_id),
            name: String(v.name),
            price: Number(v.price),
            position: Number(v.position),
          }))
          .sort((a, b) => a.position - b.position);

        if (!cancelled) {
          setVariations(cleaned);
          if (cleaned.length > 0) setSelectedVariationPos(cleaned[0].position);
        }
      } catch {
        if (!cancelled) setVariations([]);
      }
    }

    void loadVariations();

    return () => {
      cancelled = true;
    };
  }, [product?.id]);

  const currentImage = useMemo(() => {
    if (!product) return "/download.jpg";
    const img = product.images?.[selectedImage]?.url;
    return img || "/download.jpg";
  }, [product, selectedImage]);

  const selectedVariation = useMemo(() => {
    if (selectedVariationPos === null) return null;
    return variations.find((v) => v.position === selectedVariationPos) ?? null;
  }, [variations, selectedVariationPos]);

  const basePrice = Number(selectedVariation?.price ?? product?.price ?? 0);
  const displayedPrice = Number(finalPrice ?? basePrice);

  useEffect(() => {
    if (!product) return;
    if (!product.category_id) return;

    let cancelled = false;

    async function loadSimilar() {
      if (similarLoadedRef.current || !product) return;
      similarLoadedRef.current = true;

      try {
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
            const score = acceptable ? 2 : 1;

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
        // ignore
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
  }, [product?.id, product?.category_id, basePrice]);

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

      const json = (await res.json()) as { ok?: boolean; data?: unknown };
      const list = Array.isArray(json.data) ? (json.data as Coupon[]) : [];
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
      if (minValue > 0 && basePrice < minValue) {
        setCouponMessage("Valor mínimo para cupom não atingido");
        return;
      }

      const discounted = basePrice * (1 - Number(coupon.percent_off) / 100);
      setFinalPrice(discounted);
      setCouponMessage(`Cupom aplicado: -${coupon.percent_off}%`);
    } catch {
      setCouponMessage("Erro de rede ao validar cupom");
    }
  }

  if (notFound) return <main className="productPage">Produto não encontrado</main>;
  if (!product) return <main className="productPage">Carregando...</main>;

  return (
    <main className="productPage">
      <section className="productLayout">
        {/* LEFT */}
        <div className="card galleryCard">
          <img src={currentImage} alt={product.name} className="mainImage" />

          <div className="thumbRow">
            {(Array.isArray(product.images) ? product.images : []).map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedImage(index)}
                aria-label={`Selecionar imagem ${index + 1}`}
                className="thumbBtn"
              >
                <img
                  src={image.url}
                  alt={`${product.name} ${index + 1}`}
                  className={`thumbImg ${index === selectedImage ? "thumbImgActive" : ""}`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* CENTER */}
        {/* CENTER */}
<div className="card infoCard">
  <h1 className="productTitle">{product.name}</h1>

  <p className="productPrice">
    <strong>R$ {displayedPrice.toFixed(2)}</strong>
  </p>

  <p className="productDesc">{product.description || ""}</p>

  {variations.length > 0 ? (
    <div className="variationBlock">
      <span className="variationLabel">Variações disponíveis:</span>

      <div className="variationList">
        {variations.map((v, index) => (
          <button
            key={`${v.product_id}-${v.position}-${index}`}
            type="button"
            className={`variationItem ${selectedVariationPos === v.position ? "variationItemActive" : ""}`}
            onClick={() => {
              setSelectedVariationPos(v.position);
              setFinalPrice(null);
              setCouponMessage("");
            }}
          >
            <div className="variationInfo">
              <p className="variationName">{v.name}</p>
              <p className="variationStock">+Estoque ilimitado</p>
            </div>
            <span className="variationPrice">R$ {Number(v.price).toFixed(2)}</span>
          </button>
        ))}
      </div>
    </div>
  ) : null}

  <div className="actions">
    <button type="button" className="btnPrimary">
      Comprar agora
    </button>

    <button type="button" className="btnSecondary">
      Adicionar ao carrinho
    </button>
  </div>

  <div className="couponBox">
    <div className="couponRow">
      <input
        className="couponInput"
        value={couponCode}
        onChange={(event) => setCouponCode(event.target.value)}
        placeholder="Cupom"
      />

      <button type="button" className="couponBtn" onClick={() => void applyCoupon()}>
        Aplicar
      </button>
    </div>

    {couponMessage ? <p className="couponMsg">{couponMessage}</p> : null}
    {finalPrice !== null ? <p className="couponMsg">Preço final: R$ {finalPrice.toFixed(2)}</p> : null}
  </div>
</div>

        {/* RIGHT */}
        <aside className="sideBar">
          <article className="sideCard">
            <h3>Compra segura</h3>
            <p>Sua compra é protegida por criptografia SSL</p>
          </article>

          <article className="sideCard">
            <h3>Métodos de pagamentos</h3>
            <p>Pix, cartão e boleto</p>
          </article>
        </aside>
      </section>

      {similar.length > 0 && (
        <section className="similarSection">
          <h2>Produtos similares</h2>

          <div className="similarGrid">
            {similar.map((item) => (
              <article key={item.id} className="similarCard">
                <img src={item.image_url || "/download.jpg"} alt={item.name} className="similarThumb" />

                <h4 className="similarName">{item.name}</h4>
                <p className="similarPrice">R$ {Number(item.price).toFixed(2)}</p>

                <Link href={`/product/${item.slug}`}>Ver</Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}