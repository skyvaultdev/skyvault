"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import "./product.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiLock, FiX, FiMaximize2 } from "react-icons/fi";

// --- TIPOS ---
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
};

type Similar = {
  id: number;
  slug: string;
  name: string;
  price: number;
  image_url: string | null;
};

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [variations, setVariations] = useState<Variations[]>([]);
  const [selectedVariationPos, setSelectedVariationPos] = useState<number | null>(null);
  const [similar, setSimilar] = useState<Similar[]>([]);

  const [notFound, setNotFound] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [finalPrice, setFinalPrice] = useState<number | null>(null);

  // ✅ loading só do botão "Adicionar ao carrinho"
  const [loadingAdd, setLoadingAdd] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProduct() {
      const slug = params.slug;
      if (!slug) return;

      try {
        const res = await fetch(`/api/products/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          if (!cancelled && res.status === 404) setNotFound(true);
          return;
        }

        const json = await res.json();
        if (!json.ok || !json.data || cancelled) return;

        const data = json.data as Product;

        // reseta estados ao trocar de produto
        setProduct(null);
        setVariations([]);
        setSimilar([]);
        setFinalPrice(null);
        setCouponCode("");
        setCouponMessage("");
        setSelectedImage(0);
        setSelectedVariationPos(null);

        setProduct({
          ...data,
          price: Number(data.price),
          images: Array.isArray(data.images) ? data.images : [],
        });

        setNotFound(false);
      } catch {
        setNotFound(true);
      }
    }

    loadProduct();
    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  useEffect(() => {
    if (!product?.id) return;
    let cancelled = false;

    async function loadExtraData() {
      if (!product) return;

      try {
        const vRes = await fetch(`/api/products/variations/${product.id}`);
        const vJson = await vRes.json();

        if (vJson.ok && !cancelled) {
          const list = Array.isArray(vJson.data) ? vJson.data : Object.values(vJson.data || {});
          const cleaned = (list as Variations[])
            .map((v) => ({ ...v, price: Number(v.price) }))
            .sort((a, b) => a.position - b.position);

          setVariations(cleaned);

          if (cleaned.length > 0) setSelectedVariationPos(cleaned[0].position);
        }

        const allRes = await fetch(`/api/products`);
        const allJson = await allRes.json();
        if (!allJson.ok || cancelled) return;

        const pool: any[] = allJson.data;
        const currentWords = product.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

        const listSameCategory: any[] = [];
        const listSimilarWords: any[] = [];
        const listNoCategory: any[] = [];

        pool.forEach((item) => {
          if (item.id === product.id) return;

          if (product.category_id && item.category_id === product.category_id) {
            listSameCategory.push(item);
            return;
          }

          const itemWords = item.name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
          const common = currentWords.filter((w) => itemWords.includes(w));
          const similarity = common.length / Math.max(currentWords.length, 1);

          if (similarity >= 0.5) {
            listSimilarWords.push(item);
            return;
          }

          if (!item.category_id) {
            listNoCategory.push(item);
          }
        });

        const finalResults = [...listSameCategory, ...listSimilarWords, ...listNoCategory]
          .filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i)
          .slice(0, 4)
          .map((item) => ({
            id: Number(item.id),
            slug: String(item.slug),
            name: String(item.name),
            price: Number(item.price),
            image_url: item.image_url || null,
          }));

        if (!cancelled) setSimilar(finalResults);
      } catch (err) {
        console.error(err);
      }
    }

    loadExtraData();
    return () => {
      cancelled = true;
    };
  }, [product?.id, product?.category_id, product?.name]);

  const selectedVariation = useMemo(() => {
    return variations.find((v) => v.position === selectedVariationPos) || null;
  }, [variations, selectedVariationPos]);

  const basePrice = useMemo(() => {
    if (!product) return 0;
    return Number(selectedVariation?.price ?? product.price ?? 0);
  }, [selectedVariation, product]);

  const displayedPrice = useMemo(() => {
    return finalPrice !== null ? Number(finalPrice) : basePrice;
  }, [finalPrice, basePrice]);

  const currentImage = useMemo(() => {
    if (!product || !product.images.length) return "/file.svg";
    return product.images[selectedImage]?.url || "/file.svg";
  }, [product, selectedImage]);

  async function applyCoupon() {
    if (!product) return;

    const code = couponCode.trim().toUpperCase();
    if (!code) return;

    try {
      const res = await fetch("/api/coupons");
      const json = await res.json();

      const coupon = (json.data as Coupon[]).find((c) => c.code === code && c.active);

      if (coupon) {
        setFinalPrice(basePrice * (1 - Number(coupon.percent_off) / 100));
        setCouponMessage(`-${coupon.percent_off}% aplicado!`);
      } else {
        setCouponMessage("Inválido");
      }
    } catch {
      setCouponMessage("Erro");
    }
  }

  // ✅ ADICIONAR AO CARRINHO (AJUSTADO PARA O SEU COMPONENTE)
  async function handleAddToCart() {
    // 1) liga loading do botão
    setLoadingAdd(true);

    try {
      // 2) se tiver variação, manda ela; se não tiver, manda null
      //    (se sua API exigir variação, você pode bloquear quando for null)
      const variation_id = selectedVariation ? selectedVariation.position : null;

      // 3) chama sua API para adicionar item
      const response = await fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product?.id,
          variation_id,
          quantity: 1,
        }),
      });

      // 4) converte a resposta em json (pra ler message)
      const data = await response.json();

      // 5) se deu certo
      if (response.ok) {
        // 5.1) força o Next atualizar a árvore e o Header buscar o carrinho de novo
        router.refresh();

        // 5.2) evento opcional (só funciona se o Header estiver escutando)
        window.dispatchEvent(new Event("abrirCarrinho"));
      } else {
        // 6) se deu erro e for token inválido, manda pro login
        if (data?.message === "UNAUTHORIZED_TOKEN") {
          router.push("/login");
        } else {
          alert("Erro ao adicionar: " + (data?.message ?? "Erro desconhecido"));
        }
      }
    } catch (error) {
      console.error("Erro ao adicionar ao carrinho:", error);
      alert("Erro inesperado ao adicionar ao carrinho.");
    } finally {
      // 7) desliga loading
      setLoadingAdd(false);
    }
  }

  if (notFound) return <main className="productPage">Produto não encontrado</main>;
  if (!product) return <main className="productPage">Carregando...</main>;

  return (
    <main className="productPage">
      {isZoomed && (
        <div className="zoomOverlay" onClick={() => setIsZoomed(false)}>
          <button className="closeZoom">
            <FiX size={30} />
          </button>
          <img src={currentImage} alt="Zoom" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <section className="productLayout">
        <div className="card galleryCard">
          <div className="mainImageContainer">
            <img src={currentImage} alt={product.name} className="mainImage" />
            <button className="zoomBtn" onClick={() => setIsZoomed(true)}>
              <FiMaximize2 size={20} />
            </button>
          </div>

          <div className="thumbRow">
            {product.images.map((image, index) => (
              <button
                key={image.id}
                onClick={() => setSelectedImage(index)}
                className={`thumbBtn ${index === selectedImage ? "thumbActive" : ""}`}
              >
                <img src={image.url} alt="thumb" className="thumbImg" />
              </button>
            ))}
          </div>
        </div>

        <div className="card infoCard">
          <h1 className="productTitle">{product.name}</h1>

          <p className="productPrice">
            <strong>R$ {displayedPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
            {finalPrice !== null && <span className="oldPrice"> R$ {basePrice.toFixed(2).replace(".", ",")}</span>}
          </p>

          <div className="productDesc">
            {product.description?.split("\n").map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>

          {variations.length > 0 && (
            <div className="variationBlock">
              <span className="variationLabel">Selecione uma opção:</span>

              <div className="variationList">
                {variations.map((v) => (
                  <button
                    key={v.position}
                    className={`variationItem ${selectedVariationPos === v.position ? "variationItemActive" : ""}`}
                    onClick={() => setSelectedVariationPos(v.position)}
                  >
                    <div className="variationInfo">
                      <p className="variationName">{v.name}</p>
                      <p className="variationStock">Em estoque</p>
                    </div>
                    <span className="variationPrice">R$ {v.price.toFixed(2).replace(".", ",")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="actions">
            <button className="btnPrimary">Comprar agora</button>

            {/* ✅ BOTÃO AJUSTADO */}
            <button className="btnSecondary" onClick={handleAddToCart} disabled={loadingAdd}>
              {loadingAdd ? "Adicionando..." : "Adicionar ao carrinho"}
            </button>
          </div>

          <div className="couponBox">
            <div className="couponRow">
              <input
                className="couponInput"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="CUPOM"
              />
              <button className="couponBtn" onClick={applyCoupon}>
                Aplicar
              </button>
            </div>
            {couponMessage && <p className="couponMsg">{couponMessage}</p>}
          </div>
        </div>

        <aside className="sideBar">
          <article className="sideCard">
            <h3 className="securebuy">
              Compra segura <FiLock size={18} />
            </h3>
            <p>Seus dados estão protegidos.</p>
          </article>

          <aside className="sideBar">
            <article className="sideCard">
              <h3>Método de pagamento</h3>
              <p className="pix">
                Pix <img src="/pix.jpg" className="pix" />
              </p>
            </article>
          </aside>
        </aside>
      </section>

      {similar.length > 0 && (
        <section className="similarSection">
          <h2 className="similarTitle">Recomendados para você</h2>

          <div className="similarGrid">
            {similar.map((item) => (
              <div key={item.id} className="similarCard" onClick={() => router.push(`/product/${item.slug}`)}>
                <div className="similarImgWrapper">
                  <img src={item.image_url || "/file.svg"} alt={item.name} className="similarThumb" />
                </div>

                <div className="similarInfo">
                  <h4 className="similarName">{item.name}</h4>
                  <p className="similarPrice">
                    R$ {Number(item.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                  <button className="buyButton2">Comprar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}