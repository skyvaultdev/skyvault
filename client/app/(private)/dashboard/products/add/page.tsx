"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./add.css";
import { slugify } from "@/lib/utils/slugify";

type Category = { id: number; name: string; slug: string };
type FormState = {
  name: string;
  slug: string;
  description: string;
  price: string;
  categoryId: string;
  active: boolean;
};

export default function AddProductPage() {
  const [form, setForm] = useState<FormState>({ name: "", slug: "", description: "", price: "", categoryId: "", active: true });
  const [images, setImages] = useState<File[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    async function loadCategories() {
      const response = await fetch("/api/categories");
      const json = await response.json();
      if (json.ok && Array.isArray(json.data)) setCategories(json.data);
    }
    void loadCategories();
  }, []);

  const previews = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);

  function reorderImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setImages(next);
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, current) => current !== index));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const formData = new FormData();
    formData.append("name", form.name.trim());
    formData.append("slug", slugify(form.slug || form.name));
    formData.append("description", form.description);
    formData.append("price", form.price);
    formData.append("category_id", form.categoryId);
    formData.append("active", String(form.active));

    images.forEach((file) => formData.append("images", file));

    const response = await fetch("/api/products", { method: "POST", body: formData });
    const json = await response.json();
    setFeedback(json.ok ? "Produto criado com sucesso." : "Erro ao criar produto.");
  }

  return (
    <main className="addProductLayout">
      <div className="addProductMain">
        <header className="addHeader">
          <h1>Novo produto</h1>
          <Link href="/dashboard">Voltar</Link>
        </header>

        <form onSubmit={handleSubmit} className="addForm">
          <label>Nome<input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value, slug: slugify(event.target.value) }))} required /></label>
          <label>Slug<input value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))} /></label>
          <label>Preço<input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))} required /></label>
          <label>Categoria
            <select value={form.categoryId} onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}>
              <option value="">Selecione</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="full">Descrição<textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} rows={5} /></label>
          <label className="full">Imagens
            <input type="file" accept="image/*" multiple onChange={(event) => setImages(Array.from(event.target.files ?? []))} />
          </label>

          <div className="thumbList full">
            {previews.map((preview, index) => (
              <div key={preview} className="thumbItem">
                <img src={preview} alt={`Preview ${index + 1}`} />
                <div>
                  <button type="button" onClick={() => reorderImage(index, -1)}>↑</button>
                  <button type="button" onClick={() => reorderImage(index, 1)}>↓</button>
                  <button type="button" onClick={() => removeImage(index)}>Remover</button>
                </div>
              </div>
            ))}
          </div>

          <button type="submit">Salvar</button>
          {feedback ? <p>{feedback}</p> : null}
        </form>
      </div>

      <aside className="livePreview">
        <h2>Preview da compra</h2>
        <img src={previews[0] || "/download.jpg"} alt={form.name || "preview"} />
        <h3>{form.name || "Nome do produto"}</h3>
        <p>R$ {form.price || "0,00"}</p>
        <p>{form.description || "Descrição do produto"}</p>
        <button type="button">Comprar agora</button>
        <button type="button">Adicionar ao carrinho</button>
      </aside>
    </main>
  );
}
