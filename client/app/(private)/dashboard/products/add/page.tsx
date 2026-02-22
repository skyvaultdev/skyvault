"use client";

import { FormEvent, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import "./add.css";
import { slugify } from "@/lib/utils/slugify";

type Category = { id: number; name: string; slug: string };

type Variation = {
  id: string;
  name: string;
  price: string;
};

type FormState = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  active: boolean;
};

export default function AddProductPage() {
  const [form, setForm] = useState<FormState>({
    name: "",
    description: "",
    price: "",
    categoryId: "",
    active: true,
  });

  const [images, setImages] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [feedback, setFeedback] = useState("");

  const [variations, setVariations] = useState<Variation[]>([]);
  const [newVariation, setNewVariation] = useState({ name: "", price: "" });
  const [selectedVariationId, setSelectedVariationId] = useState<string>("");

  const slug = slugify(form.name);
  useEffect(() => {
    async function loadCategories() {
      const response = await fetch("/api/categories");
      const json = await response.json();
      if (json.ok && Array.isArray(json.data)) setCategories(json.data);
    }
    void loadCategories();
  }, []);

  const previews = useMemo(
    () => images.map((file) => URL.createObjectURL(file)),
    [images]
  );

  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  function reorderImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setImages(next);
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function addVariation() {
    if (!newVariation.name || !newVariation.price) return;

    const variation: Variation = {
      id: crypto.randomUUID(),
      name: newVariation.name,
      price: newVariation.price,
    };

    setVariations((prev) => [...prev, variation]);
    setNewVariation({ name: "", price: "" });
  }

  function removeVariation(id: string) {
    setVariations((prev) => prev.filter((v) => v.id !== id));
    if (selectedVariationId === id) setSelectedVariationId("");
  }

  const selectedVariation = variations.find(
    (v) => v.id === selectedVariationId
  );

  const previewPrice = selectedVariation?.price || form.price || "0,00";

  function handleRedefini() {
    setForm({
      name: "",
      description: "",
      price: "",
      categoryId: "",
      active: true,
    });

    setImages([]);
    setVariations([]);
    setNewVariation({ name: "", price: "" });
    setSelectedVariationId("");
    setFeedback("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const formData = new FormData();
    formData.append("name", form.name.trim());
    formData.append("slug", slug);
    formData.append("description", form.description);
    formData.append("price", form.price);
    formData.append("category_id", form.categoryId);
    formData.append("active", String(form.active));
    formData.append("variations", JSON.stringify(variations));

    images.forEach((file) => formData.append("images", file));

    const response = await fetch("/api/products/add", {
      method: "POST",
      body: formData,
    });

    const json = await response.json();
    setFeedback(
      json.ok ? "Produto criado com sucesso." : "Erro ao criar produto."
    );

    if(json.ok) return handleRedefini();
  }

  return (
    <main className="addProductLayout">
      <div className="addProductMain">
        <header className="addHeader">
          <h1>Novo produto</h1>
          <Link href="/dashboard">Voltar</Link>
        </header>

        <form onSubmit={handleSubmit} className="addForm">
          <label>
            Nome
            <input
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              required
            />
          </label>

          <label>
            Preço base
            <input
              type="number"
              min="1.0"
              max="100000.0"
              value={form.price}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, price: e.target.value }))
              }
              required
            />
          </label>

          <label>
            Categoria
            <select
              value={form.categoryId}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  categoryId: e.target.value,
                }))
              }
            >
              <option value="">Nenhuma</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="full">
            Descrição
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              rows={5}
            />
          </label>
          <div className="variationSection">
            <h3>Variações</h3>

            <div className="variationCreate">
              <input
                placeholder="Nome da variação"
                value={newVariation.name}
                onChange={(e) =>
                  setNewVariation((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
              />
              <input
                type="number"
                placeholder="Preço"
                value={newVariation.price}
                onChange={(e) =>
                  setNewVariation((prev) => ({
                    ...prev,
                    price: e.target.value,
                  }))
                }
              />
              <button type="button" onClick={addVariation} className="addbtn">
                Adicionar
              </button>
            </div>
            <div className="variationList">
              {variations.map((variation) => (
                <div key={variation.id} className="variationItem">
                  {variation.name} - R$ {variation.price}
                  <button
                    type="button"
                    onClick={() => removeVariation(variation.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label className="putFile">
            Imagens
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) =>
                setImages(Array.from(e.target.files ?? []))
              }
            />
          </label>

          <div className="thumbList">
            {previews.map((preview, index) => (
              <div key={preview} className="thumbItem">
                <img src={preview} alt="Preview" />
                <div>
                  <button
                    type="button"
                    onClick={() => reorderImage(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => reorderImage(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button type="submit" className="salvarbtn">Salvar</button>
          <button type="button" onClick={handleRedefini} className="redefinirbtn">Redefinir</button>
          {feedback && <p>{feedback}</p>}
        </form>
      </div>
      <aside className="livePreview">
        <h2>Preview da compra</h2>

        <img
          src={previews[0] || "/download.jpg"}
          alt={form.name || "preview"}
        />

        <h3>{form.name || "Nome do produto"}</h3>

        {variations.length > 0 && (
          <select
            value={selectedVariationId}
            onChange={(e) =>
              setSelectedVariationId(e.target.value)
            }
          >
            <option value="">Escolha uma opção</option>
            {variations.map((variation) => (
              <option key={variation.id} value={variation.id}>
                {variation.name} - R$ {variation.price}
              </option>
            ))}
          </select>
        )}

        <p>R$ {previewPrice}</p>
        <p>{form.description || "Descrição do produto"}</p>

        <button type="button" className="comprarbtn">Comprar agora</button>
        <button type="button" className="cartbtn">Adicionar ao carrinho</button>
      </aside>
    </main>
  );
}