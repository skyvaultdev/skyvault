"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AddCategoryPage() {
  const [name, setName] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [products, setProducts] = useState<Array<{ id: number; name: string }>>([]);
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    async function loadProducts() {
      const response = await fetch("/api/products");
      const json = await response.json();
      if (json.ok) setProducts((json.data ?? []).map((item: { id: number; name: string }) => ({ id: item.id, name: item.name })));
    }
    void loadProducts();
  }, []);

  async function submit() {
    const form = new FormData();
    form.append("name", name);
    if (image) form.append("image", image);
    form.append("product_ids", selected.join(","));
    await fetch("/api/categories", { method: "POST", body: form });
  }

  return (
    <main style={{ color: "white", padding: 24 }}>
      <h1>Criar categoria</h1>
      <Link href="/dashboard">Voltar</Link>
      <div style={{ display: "grid", gap: 10, maxWidth: 540 }}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome" />
        <input type="file" accept="image/*" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
        <select multiple size={8} onChange={(event) => {
          const values = Array.from(event.target.selectedOptions).map((option) => Number(option.value));
          setSelected(values);
        }}>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <button type="button" onClick={() => void submit()}>Salvar categoria</button>
      </div>
    </main>
  );
}
