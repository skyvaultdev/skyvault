"use client";

import { FormEvent, useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import "./edit.css";
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
const formatToInput = (value: any) => {
  if (!value) return "0,00";
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
};

type Category = { id: number; name: string; slug: string };
type Variation = { id: string; name: string; price: string; isNew?: boolean };
type FormState = { id?: number; name: string; description: string; price: string; categoryId: string; active: boolean; };

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id;

  const [form, setForm] = useState<FormState>({
    name: "",
    description: "",
    price: "",
    categoryId: "",
    active: true,
  });

  const [images, setImages] = useState<any[]>([]); 
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [feedback, setFeedback] = useState("");
  const [variations, setVariations] = useState<Variation[]>([]);
  const [newVariation, setNewVariation] = useState({ name: "", price: "" });
  const [selectedVariationId, setSelectedVariationId] = useState<string>(""); // Para o Preview
  const [loading, setLoading] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const catRes = await fetch("/api/categories");
        const catJson = await catRes.json();
        if (catJson.ok) setCategories(catJson.data);

        const prodRes = await fetch(`/api/products/${productId}`);
        const prodJson = await prodRes.json();

        if (prodJson.ok && prodJson.data) {
          const p = prodJson.data;
          setForm({
            id: p.id,
            name: p.name,
            description: p.description || "",
            price: formatToInput(p.price),
            categoryId: String(p.category_id || ""),
            active: Boolean(p.active),
          });

          if (p.variations) {
            setVariations(p.variations.map((v: any) => ({
              id: String(v.id),
              name: v.name,
              price: formatToInput(v.price)
            })));
          }
          if (p.images) {
            setImages(p.images.sort((a: any, b: any) => a.position - b.position));
          }
        } else { router.push("/dashboard") }
      } catch (e) {
        setFeedback("Erro ao carregar produto.");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [productId]);

  const previews = useMemo(() => {
    return images.map((img) => {
      if (img instanceof File) return URL.createObjectURL(img);
      return img.url;
    });
  }, [images]);

  useEffect(() => {
    return () => previews.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
  }, [previews]);

  const selectedVariation = variations.find((v) => v.id === selectedVariationId);
  const previewPrice = selectedVariation?.price || form.price || "0,00";

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
    setVariations((prev) => [...prev, { 
      id: crypto.randomUUID(), 
      name: newVariation.name, 
      price: newVariation.price,
      isNew: true 
    }]);
    setNewVariation({ name: "", price: "" });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback("Salvando...");

    const formData = new FormData();
    formData.append("id", String(form.id));
    formData.append("name", form.name.trim());
    formData.append("slug", slugify(form.name));
    formData.append("description", form.description);
    formData.append("price", parseCurrency(form.price));
    formData.append("category_id", form.categoryId);
    formData.append("active", String(form.active));

    const variationsToUpload = variations.map(v => ({
        name: v.name,
        price: parseCurrency(v.price)
    }));
    formData.append("variations", JSON.stringify(variationsToUpload));

    const existingImages = images.filter(img => !(img instanceof File));
    formData.append("existingImages", JSON.stringify(existingImages));
    images.forEach((img) => {
      if (img instanceof File) formData.append("newImages", img);
    });

    try {
        const response = await fetch(`/api/products/edit/${form.id}`, {
          method: "PUT",
          body: formData,
        });

        const json = await response.json();
        
        if (json.ok) {
            setFeedback("");
            setShowSuccessModal(true);
        } else {
            setFeedback("Erro ao atualizar produto.");
        }
    } catch (err) {
        setFeedback("Erro de conexão.");
    }
  }

  if (loading) return <div className="productPage">Carregando dados...</div>;

  return (
    <main className="addProductLayout">
      {showSuccessModal && (
        <div className="modalOverlay">
          <div className="modalContent">
            <div className="modalIcon">✓</div>
            <h2>Produto Atualizado!</h2>
            <p>As alterações em <strong>{form.name}</strong> foram salvas com sucesso.</p>
            <div className="modalButtons">
              <button onClick={() => setShowSuccessModal(false)} className="secondaryBtn">Continuar editando</button>
              <button onClick={() => router.push("/dashboard")} className="primaryBtn">Voltar ao Painel</button>
            </div>
          </div>
        </div>
      )}

      <div className="addProductMain">
        <header className="addHeader">
          <h1>Editar: {form.name}</h1>
          <Link href="/dashboard">Voltar</Link>
        </header>

        <form onSubmit={handleSubmit} className="addForm">
          <label>Nome
            <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
          </label>

          <label>Preço base (R$)
            <input type="text" value={form.price} onChange={(e) => setForm({...form, price: e.target.value.replace(/[^0-9,.]/g, "")})} required />
          </label>

          <label>Categoria
            <select value={form.categoryId} onChange={(e) => setForm({...form, categoryId: e.target.value})}>
              <option value="">Nenhuma</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <label className="full">Descrição
            <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} rows={5} />
          </label>

          <div className="variationSection">
            <h3>Variações</h3>
            <div className="variationCreate">
              <input placeholder="Nome" value={newVariation.name} onChange={(e) => setNewVariation({...newVariation, name: e.target.value})} />
              <input placeholder="Preço" value={newVariation.price} onChange={(e) => setNewVariation({...newVariation, price: e.target.value.replace(/[^0-9,.]/g, "")})} />
              <button type="button" onClick={addVariation} className="addbtn">Adicionar</button>
            </div>
            <div className="variationList">
              {variations.map((v) => (
                <div key={v.id} className="variationItem">
                  {v.name} - R$ {v.price}
                  <button type="button" onClick={() => setVariations(variations.filter(x => x.id !== v.id))}>✕</button>
                </div>
              ))}
            </div>
          </div>

          <label className="putFile">Imagens
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageChange} />
          </label>

          <div className="thumbList">
            {previews.map((url, index) => (
              <div key={index} className="thumbItem">
                <img src={url} alt="preview" />
                <div className="thumbActions">
                  <button type="button" onClick={() => reorderImage(index, -1)}>↑</button>
                  <button type="button" onClick={() => reorderImage(index, 1)}>↓</button>
                  <button type="button" onClick={() => removeImage(index)}>Remover</button>
                </div>
              </div>
            ))}
          </div>

          <button type="submit" className="salvarbtn">Salvar Alterações</button>
          {feedback && <p className="feedback">{feedback}</p>}
        </form>
      </div>

      <aside className="livePreview">
        <h2>Preview</h2>
        <img src={previews[0] || "/file.svg"} alt="preview" />
        <h3>{form.name || "Nome do produto"}</h3>
        {variations.length > 0 && (
          <select value={selectedVariationId} onChange={(e) => setSelectedVariationId(e.target.value)} className="select2">
            <option value="">Escolha uma opção</option>
            {variations.map((v) => (
              <option key={v.id} value={v.id}>{v.name} - R$ {v.price}</option>
            ))}
          </select>
        )}

        <p className="pricePreview">R$ {previewPrice}</p>
        <p className="productDesc">{form.description}</p>
        <button type="button" className="comprarbtn">Comprar agora</button>
      </aside>
    </main>
  );
}