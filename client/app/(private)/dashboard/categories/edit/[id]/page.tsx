"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function EditCategoryPage() {
  const params = useParams<{ id: string }>();
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [products, setProducts] = useState<Array<{ id: number; name: string }>>([]);
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    async function load() {
      const id = params.id;
      if (!id) return;
      const [catRes, prodRes] = await Promise.all([fetch(`/api/categories/${id}`), fetch("/api/products")]);
      const catJson = await catRes.json();
      const prodJson = await prodRes.json();
      if (catJson.ok) {
        setName(catJson.data.name);
        setImageUrl(catJson.data.image_url || "");
        setSelected((catJson.data.products || []).map((item: { id: number }) => item.id));
      }
      if (prodJson.ok) setProducts(prodJson.data ?? []);
    }
    void load();
  }, [params.id]);

  async function save() {
    const id = params.id;
    if (!id) return;
    await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, imageUrl, productIds: selected }),
    });
  }

  return (
    <main style={{ color: "white", padding: 24 }}>
      <h1>Editar categoria</h1>
      <Link href="/dashboard">Voltar</Link>
      <div style={{ display: "grid", gap: 10, maxWidth: 540 }}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome" />
        <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="URL da imagem" />
        <select multiple size={8} value={selected.map(String)} onChange={(event) => {
          const values = Array.from(event.target.selectedOptions).map((option) => Number(option.value));
          setSelected(values);
        }}>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <button type="button" onClick={() => void save()}>Salvar alterações</button>
      </div>
    </main>
  );
}
