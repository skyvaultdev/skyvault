"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./category.css";

type Product = {
  id: number;
  name: string;
};

export default function AddCategoryPage() {
  const [name, setName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  const [loading, setLoading] = useState(false);

  const [successData, setSuccessData] = useState<{
    name: string;
    totalProducts: number;
  } | null>(null);

  useEffect(() => {
    async function loadProducts() {
      const response = await fetch("/api/products?withoutCategory=1");
      const json = await response.json();

      if (json.ok) {
        setProducts(
          (json.data ?? []).map((p: Product) => ({
            id: p.id,
            name: p.name,
          }))
        );
      }
    }

    void loadProducts();
  }, []);

  function toggleProduct(id: number) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((p) => p !== id)
        : [...prev, id]
    );
  }

  async function submit() {
    if (!name.trim()) return alert("Digite um nome");

    setLoading(true);

    const form = new FormData();
    form.append("name", name);
    form.append("product_ids", selected.join(","));
    const res = await fetch("/api/categories/add", {
      method: "POST",
      body: form,
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      alert(json.error || "Erro ao criar categoria");
      return;
    }

    setSuccessData({
      name,
      totalProducts: selected.length,
    });

    setName("");
    setSelected([]);
  }

  return (
    <main className="categoryPage">
      <header className="categoryHeader">
        <h1>Criar categoria</h1>
        <Link href="/dashboard" className="backBtn">
          ← Voltar
        </Link>
      </header>

      <section className="categoryCard">
        <label>Nome da categoria</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Derivados"
          className="input"
        />

        <label>Produtos sem categoria</label>

        <div className="productGrid">
          {products.map((product) => {
            const active = selected.includes(product.id);

            return (
              <div
                key={product.id}
                className={`productSelect ${active ? "active" : ""}`}
                onClick={() => toggleProduct(product.id)}
              >
                {product.name}
              </div>
            );
          })}

          {products.length === 0 && (
            <p className="empty">
              Todos os produtos já possuem categoria.
            </p>
          )}
        </div>

        <button
          className="saveBtn"
          disabled={loading}
          onClick={() => void submit()}
        >
          {loading ? "Salvando..." : "Salvar categoria"}
        </button>
      </section>

      {successData && (
        <div className="modalOverlay">
          <div className="modalBox">
            <h2>✅ Categoria criada!</h2>

            <p>
              <strong>Nome:</strong> {successData.name}
            </p>

            <p>
              <strong>Produtos atribuídos:</strong>{" "}
              {successData.totalProducts}
            </p>

            <button
              className="saveBtn"
              onClick={() => setSuccessData(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <div className="transparency-box"></div>
    </main>
  );
}