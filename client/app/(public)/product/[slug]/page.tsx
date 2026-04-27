"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import "./product.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiLock, FiX, FiMaximize2 } from "react-icons/fi";

type ProductImage = { id: number; url: string; position: number };

type Product = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  category_id: number | null;
  images: ProductImage[];
  stock_count: number;
  is_unlimited: boolean;
};

type Variations = {
  id: number;
  product_id: number;
  name: string;
  price: number;
  position: number;
  stock_count: number;
  is_unlimited: boolean;
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

function getSimilarity(a: string, b: string) {
  const wordsA = a.toLowerCase().split(/\s+/);
  const wordsB = b.toLowerCase().split(/\s+/);

  const matches = wordsA.filter((w) => wordsB.includes(w));
  return matches.length / Math.max(wordsA.length, 1);
}

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

  const [loadingAdd, setLoadingAdd] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;
  const totalPages = Math.ceil(similar.length / itemsPerPage);

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return similar.slice(startIndex, startIndex + itemsPerPage);
  }, [similar, currentPage]);

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

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

        const vData: Variations[] = Array.isArray(json.data.variations)
          ? json.data.variations
          : [];

        const cleaned = vData
          .map((v) => ({
            ...v,
            price: Number(v.price),
            stock_count: v.stock_count,
            is_unlimited: Boolean(v.is_unlimited)
          }))
          .sort((a, b) => a.position - b.position);

        setVariations(cleaned);
        if (cleaned.length > 0) {
          const firstAvailable = cleaned.find(v => v.is_unlimited || v.stock_count > 0);
          setSelectedVariationPos(firstAvailable ? firstAvailable.id : cleaned[0].id);
        }

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
        const allRes = await fetch(`/api/products`);
        const allJson = await allRes.json();

        const pool: any[] = allJson.data;

        const sameCategory: any[] = [];
        const similarWords: { item: any; score: number }[] = [];
        const noCategory: any[] = [];

        pool.forEach((item) => {
          if (item.id === product.id) return;

          if (product.category_id && item.category_id === product.category_id) {
            sameCategory.push(item);
            return;
          }

          const score = getSimilarity(product.name, item.name);
          if (score >= 0.4) {
            similarWords.push({ item, score });
            return;
          }

          if (!item.category_id) {
            noCategory.push(item);
          }
        });

        similarWords.sort((a, b) => b.score - a.score);
        const finalResults = [
          ...sameCategory,
          ...similarWords.map((s) => s.item),
          ...noCategory,
        ]
          .filter((v, i, arr) => arr.findIndex((t) => t.id === v.id) === i)
          .slice(0, 4)
          .map((item) => ({
            id: Number(item.id),
            slug: String(item.slug),
            name: String(item.name),
            price: Number(item.price),
            image_url: item.image_url || null,
          }));

        setSimilar(finalResults);
      } catch (err) {
        console.error(err);
      }
    }

    loadExtraData();
  }, [product?.id, product?.category_id, product?.name]);

  const selectedVariation = useMemo(() => {
    return variations.find((v) => v.id === selectedVariationPos) || null;
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

  const isAvailable = useMemo(() => {
    if (!product) return false;
    const target = selectedVariation ?? product;
    if (!target) return false;

    return target.is_unlimited || target.stock_count > 0;
  }, [product, selectedVariation]);

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

  async function handleAddToCart() {
    setLoadingAdd(true);

    try {
      const variation_id = selectedVariation ? selectedVariation.id : null;
      const response = await fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product?.id,
          variation_id,
          quantity: 1,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        router.refresh();
        window.dispatchEvent(new Event("abrirCarrinho"));
      } else {
        if (data?.error === "UNAUTHORIZED_TOKEN") {
          router.push("/login");
        } else {
          alert("Erro ao adicionar: " + (data?.message ?? "Erro desconhecido"));
        }
      }
    } catch (error) {
      console.error("Erro ao adicionar ao carrinho:", error);
      alert("Erro inesperado ao adicionar ao carrinho.");
    } finally {
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
                {variations.map((v) => {
                  const outOfStock = !v.is_unlimited && v.stock_count < 1;
                  return (
                    <button
                      key={v.id}
                      disabled={outOfStock}
                      className={`variationItem ${selectedVariationPos === v.id ? "variationItemActive" : ""} ${outOfStock ? "outOfStock" : ""}`}
                      onClick={() => setSelectedVariationPos(v.id)}
                    >
                      <div className="variationInfo">
                        <p className="variationName">{v.name}</p>
                        <p className="variationStock">
                          {v.is_unlimited ? "Disponível" : outOfStock ? "Esgotado" : `${v.stock_count} em estoque`}
                        </p>
                      </div>
                      <span className="variationPrice">R$ {v.price.toFixed(2).replace(".", ",")}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="actions">
            <button
              className="btnPrimary"
              disabled={!isAvailable || loadingAdd}
            >
              {isAvailable ? "Comprar agora" : "Produto Esgotado"}
            </button>

            <button
              className="btncartadd"
              onClick={handleAddToCart}
              disabled={!isAvailable || loadingAdd}
            >
              {loadingAdd ? "Adicionando..." : isAvailable ? "Adicionar ao carrinho" : "Esgotado"}
            </button>
          </div>

          {/*  <div className="couponBox">
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
          </div>-*/}
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
            {paginatedProducts.map((item) => (
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

      {totalPages > 1 && (
        <div className="pagination">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
            className="btnPagination"
          >
            &larr;
          </button>
          {pageNumbers.map((num) => (
            <button
              key={num}
              onClick={() => setCurrentPage(num)}
              className={`pageNumber ${currentPage === num ? "active" : ""} btnPagination`}
            > {num}
            </button>
          ))}
          <button
            disabled={currentPage === totalPages} 
            onClick={() => setCurrentPage(prev => prev + 1)}
            className="btnPagination"
          >
            &rarr;
          </button>

        </div>
      )}

      {similar.length === 0 && (
        <p className="emptyMsg">Nenhum produto encontrado.</p>
      )}
    </main>
  );
}