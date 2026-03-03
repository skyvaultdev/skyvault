"use client";

import { FormEvent, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation"; // Importado para navegação
import "./add.css";
import { slugify } from "@/lib/utils/slugify";

const parseCurrency = (value: string) => {
  const cleanValue = value.replace(/[^\d.,]/g, "");
  if (!cleanValue.includes(",") && !cleanValue.includes(".")) {
    return cleanValue;
  }

  const pieces = cleanValue.split(/[.,]/);
  const decimals = pieces.pop();
  const integers = pieces.join("");
  
  return `${integers}.${decimals}`;
};

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
  const router = useRouter(); // Hook para redirecionar
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
  const [showSuccessModal, setShowSuccessModal] = useState(false); // Estado do Modal

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
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setImages((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

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

  const selectedVariation = variations.find((v) => v.id === selectedVariationId);
  const previewPrice = selectedVariation?.price || form.price || "0,00";

  function handleRedefini() {
    setForm({ name: "", description: "", price: "", categoryId: "", active: true });
    setImages([]);
    setVariations([]);
    setNewVariation({ name: "", price: "" });
    setSelectedVariationId("");
    setFeedback("");
    setShowSuccessModal(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback("Criando...");

    const formData = new FormData();
    formData.append("name", form.name.trim());
    formData.append("slug", slug);
    formData.append("description", form.description);
    formData.append("price", parseCurrency(form.price));
    formData.append("category_id", form.categoryId);
    formData.append("active", String(form.active));

    const variationsToUpload = variations.map(v => ({
        ...v,
        price: parseCurrency(v.price)
    }));
    formData.append("variations", JSON.stringify(variationsToUpload));

    images.forEach((file) => formData.append("images", file));

    const response = await fetch("/api/products/add", {
      method: "POST",
      body: formData,
    });

    const json = await response.json();
    
    if (json.ok) {
        setFeedback("");
        setShowSuccessModal(true);
    } else {
        setFeedback("Erro ao criar produto.");
    }
  }

  return (
    <main className="addProductLayout">
      {showSuccessModal && (
        <div className="modalOverlay">
          <div className="modalContent">
            <div className="modalIcon">✓</div>
            <h2>Produto Criado!</h2>
            <p>O produto <strong>{form.name}</strong> foi adicionado ao catálogo.</p>
            <div className="modalButtons">
              <button onClick={handleRedefini} className="secondaryBtn">Adicionar outro</button>
              <button onClick={() => router.push("/dashboard")} className="primaryBtn">Ir para o Painel</button>
            </div>
          </div>
        </div>
      )}

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
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>

          <label>
            Preço base (Ex: 999,99)
            <input
              type="text"
              placeholder="0,00"
              value={form.price}
              onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value.replace(/[^0-9,.]/g, "") }))}
              required
            />
          </label>

          <label>
            Categoria
            <select
              value={form.categoryId}
              onChange={(e) => setForm((prev) => ({ ...prev, categoryId: e.target.value }))}
            >
              <option value="">Nenhuma</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>

          <label className="full">
            Descrição
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={5}
            />
          </label>

          <div className="variationSection">
            <h3>Variações</h3>
            <div className="variationCreate">
              <input
                placeholder="Nome da variação"
                value={newVariation.name}
                onChange={(e) => setNewVariation((prev) => ({ ...prev, name: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Preço (0,00)"
                value={newVariation.price}
                onChange={(e) => setNewVariation((prev) => ({ ...prev, price: e.target.value.replace(/[^0-9,.]/g, "") }))}
              />
              <button type="button" onClick={addVariation} className="addbtn">Adicionar</button>
            </div>
            <div className="variationList">
              {variations.map((v) => (
                <div key={v.id} className="variationItem">
                  {v.name} - R$ {v.price}
                  <button type="button" onClick={() => removeVariation(v.id)}>✕</button>
                </div>
              ))}
            </div>
          </div>

          <label className="putFile">
            Imagens (Clique para adicionar várias)
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
            />
          </label>

          <div className="thumbList">
            {previews.map((preview, index) => (
              <div key={preview} className="thumbItem">
                <img src={preview} alt="Preview" />
                <div className="thumbActions">
                  <button type="button" onClick={() => reorderImage(index, -1)}>↑</button>
                  <button type="button" onClick={() => reorderImage(index, 1)}>↓</button>
                  <button type="button" onClick={() => removeImage(index)}>Remover</button>
                </div>
              </div>
            ))}
          </div>

          <button type="submit" className="salvarbtn">Salvar</button>
          <button type="button" onClick={handleRedefini} className="redefinirbtn">Limpar campos</button>
          {feedback && <p className="feedback">{feedback}</p>}
        </form>
      </div>

      <aside className="livePreview">
        <h2>Preview da compra</h2>
        <img src={previews[0] || "/file.svg"} alt="preview" />
        <h3>{form.name || "Nome do produto"}</h3>

        {variations.length > 0 && (
          <select value={selectedVariationId} onChange={(e) => setSelectedVariationId(e.target.value)}>
            <option value="">Escolha uma opção</option>
            {variations.map((v) => (
              <option key={v.id} value={v.id}>{v.name} - R$ {v.price}</option>
            ))}
          </select>
        )}

        <p className="pricePreview">R$ {previewPrice}</p>
        <p className="productDesc">
            {form.description || "Sem descrição disponível."}
        </p>
        <button type="button" className="comprarbtn">Comprar agora</button>
      </aside>
    </main>
  );
}