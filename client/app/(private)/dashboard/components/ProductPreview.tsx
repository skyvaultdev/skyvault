"use client";

import { useEffect, useMemo, useState } from "react";
import { FiLock, FiArrowLeft } from "react-icons/fi";
import "./components.css";


type ProductImage = {
  id: number;
  url: string;
  position: number;
};

type Variation = {
  product_id: number;
  name: string;
  price: number;
  position: number;
};

type Product = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  images: ProductImage[];
};


interface PreviewPanelProps {
  slug: string;
  onBack: () => void;
}

export default function PreviewPanel({ slug, onBack }: PreviewPanelProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [selectedVariationPos, setSelectedVariationPos] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);

      try {
        const res = await fetch(`/api/products/${encodeURIComponent(slug)}`);
        const json = await res.json();

        if (!json.ok || !json.data) {
          if (!cancelled) setProduct(null);
          return;
        }

        const productData: Product = {
          ...json.data,
          price: Number(json.data.price),
          images: Array.isArray(json.data.images) ? json.data.images : [],
        };

        if (cancelled) return;
        setProduct(productData);
        const vRes = await fetch(`/api/products/variations/${productData.id}`);
        const vJson = await vRes.json();

        if (vJson.ok && vJson.data) {
          const list = Array.isArray(vJson.data)
            ? vJson.data
            : Object.values(vJson.data);

          const cleaned = (list as any[])
            .map((v) => ({
              product_id: Number(v.product_id),
              name: String(v.name),
              price: Number(v.price),
              position: Number(v.position),
            }))
            .sort((a, b) => a.position - b.position);

          if (!cancelled) {
            setVariations(cleaned);
            setSelectedVariationPos(
              cleaned.length > 0 ? cleaned[0].position : null
            );
          }
        }
      } catch (err) {
        console.error("Erro no preview:", err);
        if (!cancelled) {
          setProduct(null);
          setVariations([]);
          setSelectedVariationPos(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (slug) loadData();

    return () => {
      cancelled = true;
    };
  }, [slug]);


  const currentImage = useMemo(() => {
    if (!product?.images?.length) return "/file.svg";
    return product.images[selectedImage]?.url || "/file.svg";
  }, [product, selectedImage]);


  const displayedPrice = useMemo(() => {
    const variation = variations.find(
      (v) => v.position === selectedVariationPos
    );

    const price = variation ? variation.price : product?.price ?? 0;
    return Number(price);
  }, [variations, selectedVariationPos, product]);


  if (loading)
    return (
      <div className="previewContainer">
        <div className="productPage">Carregando Preview...</div>
      </div>
    );

  if (!product)
    return (
      <div className="previewContainer">
        <div className="productPage">Produto não encontrado.</div>
      </div>
    );


  return (
    <div className="previewContainer">
      <main className="productPage">
        <button
          className="previewBackBtn"
          onClick={onBack}
          type="button"
        >
          <FiArrowLeft /> Voltar ao Painel
        </button>

        <section className="productLayout">
          {/* GALERIA */}
          <div className="card galleryCard">
            <img
              src={currentImage}
              alt={product.name}
              className="mainImage"
            />

            <div className="thumbRow">
              {product.images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setSelectedImage(index)}
                  className={`thumbBtn ${
                    index === selectedImage ? "thumbActive" : ""
                  }`}
                >
                  <img
                    src={image.url}
                    alt="thumbnail"
                    className="thumbImg"
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="card infoCard">
            <h1 className="productTitle">{product.name}</h1>

            <p className="productPrice">
              <strong>
                R${" "}
                {displayedPrice.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </strong>
            </p>

            <div className="productDesc">
              {(product.description || "Sem descrição disponível.")
                .split("\n")
                .map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
            </div>

            {variations.length > 0 && (
              <div className="variationBlock">
                <span className="variationLabel">
                  Selecione o plano:
                </span>

                <div className="variationList">
                  {variations.map((v) => (
                    <button
                      key={`${v.product_id}-${v.position}`}
                      type="button"
                      className={`variationItem ${
                        selectedVariationPos === v.position
                          ? "variationItemActive"
                          : ""
                      }`}
                      onClick={() =>
                        setSelectedVariationPos(v.position)
                      }
                    >
                      <div className="variationInfo">
                        <p className="variationName">{v.name}</p>
                        <p className="variationStock">Disponível</p>
                      </div>

                      <span className="variationPrice">
                        R$ {v.price.toFixed(2).replace(".", ",")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="actions">
              <button
                type="button"
                className="btnPrimary"
                disabled
              >
                Comprar agora (Preview)
              </button>
            </div>
          </div>
          
          <aside className="sideBar">
            <article className="sideCard">
              <h3 className="securebuy">
                Compra segura <FiLock size={20} />
              </h3>
              <p>
                Sua compra é protegida por criptografia SSL
              </p>
            </article>
          </aside>
        </section>
      </main>
    </div>
  );
}