"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import "./stock.css";

type StockType = "key" | "file" | "infinite";

export default function StockEditPage() {
  const params = useParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slug = params.slug as any;

  const [product, setProduct] = useState<any>(null);
  const [variations, setVariations] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [isInternalLoading, setIsInternalLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedVariationId, setSelectedVariationId] = useState<number | null>(null);

  const [stockType, setStockType] = useState<StockType>("key");
  const [stockContent, setStockContent] = useState("");
  const [keysInput, setKeysInput] = useState("");
  const [infiniteMessage, setInfiniteMessage] = useState("");

  const [stockCount, setStockCount] = useState(0);
  const [stockCount2, setStockCount2] = useState(0);
  const [stockCount3, setStockCount3] = useState(0);
  const [isUnlimited, setIsUnlimited] = useState(false);

  useEffect(() => {
    if (!slug) return;

    async function load() {
      try {
        const res = await fetch(`/api/products/${slug}`);
        const json = await res.json();

        const prod = json?.data;
        setProduct(prod);

        if (Array.isArray(prod?.variations)) {
          setVariations(prod.variations);
        }

        if (prod?.id) {
          await handleLoadStock(prod.id, "product");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [slug]);

  async function handleLoadStock(targetId: number, target: "product" | "variation") {
    if (!targetId) return;

    setSelectedVariationId(target === "variation" ? targetId : null);
    setIsInternalLoading(true);

    setKeysInput("");
    setStockContent("");
    setInfiniteMessage("");
    setStockCount(0);
    setStockCount2(0);
    setStockCount3(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    try {
      const res = await fetch(`/api/stock/info/${target}/${targetId}`);
      const json = await res.json();

      const data = json?.data;
      if (!json.ok || !data) return;

      const type: StockType = data.stock_type || "key";
      const currentCount = Number(data.stock_count) || 0;

      setStockType(type);
      setIsUnlimited(!!data.is_unlimited);

      if (type === "key") {
        setKeysInput(data.stock_content || "");
        setStockCount(data.stock_content ? data.stock_content.split("\n").length : 0);
      } else if (type === "file") {
        setStockContent(data.stock_content || "");
        setStockCount2(currentCount);
      } else if (type === "infinite") {
        setInfiniteMessage(data.stock_content || "");
        setStockCount3(currentCount);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsInternalLoading(false);
    }
  }

  async function handleSaveStock() {
    const isBase = selectedVariationId === null;
    const targetId = isBase ? product?.id : selectedVariationId;

    if (!targetId) return alert("Erro: ID do alvo não encontrado.");

    const formData = new FormData();
    formData.append("type", stockType);

    if (stockType === "key") {
      let count = keysInput ? keysInput.split("\n").length : 0;
      formData.append("content", keysInput);
      formData.append("is_unlimited", "false");
      formData.append("ghost_stock", String(count));
    }

    if (stockType === "file") {
      formData.append("content", stockContent);
      formData.append("is_unlimited", String(isUnlimited));
      if (!isUnlimited) {
        formData.append("ghost_stock", String(stockCount2));
      }
      if (fileInputRef.current?.files?.[0]) {
        formData.append("file", fileInputRef.current.files[0]);
      }
    }

    if (stockType === "infinite") {
      formData.append("content", infiniteMessage);
      formData.append("is_unlimited", String(isUnlimited));
      if (!isUnlimited) {
        formData.append("ghost_stock", String(stockCount3));
      }
    }

    setIsSaving(true);

    try {
      const res = await fetch(
        `/api/stock/update/${isBase ? "product" : "variation"}/${targetId}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (res.ok) {
        alert("Salvo com sucesso");
        handleLoadStock(targetId!, isBase ? "product" : "variation");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }

  if (loading) return <p>Carregando...</p>;

  return (
    <div className="pageHeader">
      <div>
        <Link href="/dashboard" className="textBtn">
          ← Voltar
        </Link>
        <h2>📦 {product?.name}</h2>
      </div>

      <div className="stockGrid">
        <div className="settingsCard">
          <label className="fieldLabel">Selecionar:</label>

          <div className="stockTargetList">
            <button
              className={selectedVariationId === null ? "targetBtn active" : "targetBtn"}
              onClick={() => handleLoadStock(product?.id, "product")}
            >
              Principal
            </button>

            {variations.map((v) => (
              <button
                key={v.id}
                className={selectedVariationId === v.id ? "targetBtn active" : "targetBtn"}
                onClick={() => handleLoadStock(v.id, "variation")}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>

        <div className="dashboardContainer">
          <div className="stockTypeGrid">
            <button onClick={() => setStockType("key")} className={`typeBtn ${stockType === "key" ? "active" : ""}`}>
              Keys
            </button>

            <button onClick={() => setStockType("file")} className={`typeBtn ${stockType === "file" ? "active" : ""}`}>
              Arquivo
            </button>

            <button onClick={() => setStockType("infinite")} className={`typeBtn ${stockType === "infinite" ? "active" : ""}`}>
              Fantasma
            </button>
          </div>

          {isInternalLoading ? (
            <p>Carregando...</p>
          ) : (
            <>
              {stockType === "key" && (
                <>
                  <label className="fieldLabel">Chaves (Estoque atual: {stockCount})</label>
                  <textarea
                    className="settingsTextarea"
                    value={keysInput}
                    onChange={(e) => setKeysInput(e.target.value)}
                    placeholder="Uma key por linha"
                  />
                </>
              )}
              {stockType === "file" && (
                <>
                  <div className="fileUploadZone">
                    <label className="fieldLabel">Arquivo:</label>
                    <input type="file" ref={fileInputRef} className="settingsInput2" />

                    {stockContent && (
                      <div className="currentFileContainer">
                        <div className="fileInfo">
                          <p className="fileNameText" title={stockContent}>
                            Arquivo atual: <strong>{stockContent}</strong>
                          </p>
                          <a
                            href={`/api/files/products/uploads/${stockContent}`}
                            download={stockContent}
                            className="downloadLink"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            📥 Baixar Arquivo
                          </a>
                        </div>

                        <div className="filePreview">
                          {stockContent && /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(stockContent) ? (
                            <img
                              src={`/api/files/products/uploads/${stockContent}`}
                              alt="Preview do produto"
                              className="previewImage"
                              onError={(e) => {
                                const target = e.currentTarget;
                                target.onerror = null;
                                target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="noPreview">
                              <span>Pre-visualização indisponível</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="unlimitedToggle">
                    <label className="fieldLabel">📦 - Produto Ilimitado?</label>
                    <div className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={isUnlimited}
                        onChange={(e) => setIsUnlimited(e.target.checked)}
                      />
                      <span>Vendas Ilimitadas</span>
                    </div>

                    {!isUnlimited && (
                      <input
                        type="number"
                        className="settingsInput"
                        value={stockCount2}
                        onChange={(e) => setStockCount2(Number(e.target.value))}
                        placeholder="Quantidade disponível"
                      />
                    )}
                  </div>
                </>
              )}

              {stockType === "infinite" && (
                <>
                  <label className="fieldLabel">Mensagem:</label>
                  <input
                    className="settingsInput"
                    value={infiniteMessage}
                    onChange={(e) => setInfiniteMessage(e.target.value)}
                  />

                  <div>
                    <label className="fieldLabel">📦 - Produto Ilimitado?</label>

                    <div className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={isUnlimited}
                        onChange={(e) => setIsUnlimited(e.target.checked)}
                      />
                      <span>Sempre em Estoque</span>
                    </div>

                    {!isUnlimited && (
                      <input
                        type="number"
                        className="settingsInput"
                        value={stockCount3}
                        onChange={(e) => setStockCount3(Number(e.target.value))}
                        placeholder="Número visual"
                      />
                    )}

                    <small>Este número aparecerá para o cliente.</small>
                  </div>
                </>
              )}
            </>
          )}

          <button className="btnConfirm2" onClick={handleSaveStock} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar"}
          </button>

          <button className="textBtn2" onClick={() => {
            setStockContent("");
            setKeysInput("");
            setInfiniteMessage("");
            setStockCount(0);
            setStockCount2(0);
            setStockCount3(0);
          }}>
            Limpar
          </button>
        </div>
      </div>
    </div>
  );
}