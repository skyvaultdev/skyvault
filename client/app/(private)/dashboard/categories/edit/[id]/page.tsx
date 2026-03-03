"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import "./category.css";

type Product = {
  id: number;
  name: string;
  category_id?: number | null;
  category_name?: string | null; // Adicionado para mostrar o nome da categoria atual
};

export default function EditCategoryPage() {
  const params = useParams();
  const categoryId = params.id; // Pode ser ID ou Slug

  const [name, setName] = useState("");
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successData, setSuccessData] = useState<{ name: string; totalProducts: number } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const catRes = await fetch(`/api/categories/${categoryId}`);
        const catJson = await catRes.json();

        const prodRes = await fetch("/api/products");
        const prodJson = await prodRes.json();

        if (catJson.ok && prodJson.ok) {
          const categoryData = catJson.data;
          const allProducts = prodJson.data ?? [];

          setName(categoryData.name);
          setCurrentId(categoryData.id);
          setProducts(allProducts);

          const initialSelected = allProducts
            .filter((p: Product) => p.category_id === categoryData.id)
            .map((p: Product) => p.id);

          setSelected(initialSelected);
        }
      } catch (err) {
        console.error("Erro ao carregar dados", err);
      } finally {
        setLoading(false);
      }
    }

    if (categoryId) void loadData();
  }, [categoryId]);

  function toggleProduct(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function submit() {
    if (!name.trim()) return alert("Digite um nome");

    setSaving(true);
    const form = new FormData();
    form.append("id", String(categoryId));  
    form.append("name", name);
    form.append("product_ids", selected.join(","));

    const res = await fetch("/api/categories/edit", {
      method: "POST",
      body: form,
    });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      alert(json.error || "Erro ao editar categoria");
      return;
    }

    setSuccessData({ name, totalProducts: selected.length });
  }

  if (loading) return <main className="categoryPage"><p>Carregando...</p></main>;

  return (
    <main className="categoryPage">
      <header className="categoryHeader">
        <h1>Editar categoria: <span style={{ color: '#0070f3' }}>{name}</span></h1>
        <Link href="/dashboard" className="backBtn">← Voltar</Link>
      </header>

      <section className="categoryCard">
        <label>Nome da categoria</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          placeholder="Ex: Teclados Mecânicos"
        />

        <label style={{ marginTop: '20px', display: 'block' }}>
          Gerenciar Produtos
        </label>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
          Clique para selecionar/remover. Produtos marcados pertencem a esta categoria.
        </p>

        <div className="productGrid">
          {products.map((product) => {
            const isFromThisCategory = product.category_id === currentId;
            const active = selected.includes(product.id);

            return (
              <div
                key={product.id}
                className={`productSelect ${active ? "active" : ""}`}
                onClick={() => toggleProduct(product.id)}
              >
                <div className="productInfo">
                  <p className="productName">{product.name}</p>

                  {/* Lógica de rótulos */}
                  {isFromThisCategory ? (
                    <small className="badge current">Já pertence a esta categoria</small>
                  ) : product.category_name ? (
                    <small className="badge other">Atualmente em: <strong>{product.category_name}</strong></small>
                  ) : (
                    <small className="badge none">Sem categoria</small>
                  )}
                </div>

                {active && <span className="checkIcon">Lincado ✓</span>}
              </div>
            );
          })}
        </div>

        <button className="saveBtn" disabled={saving} onClick={() => void submit()}>
          {saving ? "Salvando..." : "Salvar Alterações"}
        </button>
      </section>

      {successData && (
        <div className="modalOverlay">
          <div className="modalBox">
            <h2>✅ Sucesso!</h2>
            <p>A categoria <strong>{successData.name}</strong> foi atualizada.</p>
            <p>Total de produtos vinculados: {successData.totalProducts}</p>
            <button className="saveBtn" onClick={() => setSuccessData(null)}>Fechar</button>
          </div>
        </div>
      )}

      <div className="transparency-box"> </div>
    </main>
  );
}