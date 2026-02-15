"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./add.css";

type Category = {
  id: string; 
  name: string;
  slug: string;
};

type FormState = {
  name: string;
  slug: string;
  description: string;
  price: string;
  imageFile: File | null;
  categoryId: string;
  active: boolean;
};

const initialForm: FormState = {
  name: "",
  slug: "",
  description: "",
  price: "",
  imageFile: null,
  categoryId: "",
  active: true,
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AddProductPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");

  useEffect(() => {
    async function loadCategories() {
      try {
        setLoadingCategories(true);
        setCategoriesError("");

        const res = await fetch("/api/categories", { method: "GET" });

        if (!res.ok) {
          setCategoriesError("Falha ao carregar categorias.");
          return;
        }

        const data = (await res.json()).product as Category[];
        setCategories(Array.isArray(data) ? data : []);
      } catch {
        setCategoriesError("Erro de rede ao carregar categorias.");
      } finally {
        setLoadingCategories(false);
      }
    }

    loadCategories();
  }, []);

  const isFormValid = useMemo(() => {
    const parsedPrice = Number(form.price);

    return (
      form.name.trim().length > 0 &&
      Number.isFinite(parsedPrice) &&
      parsedPrice > 0
    );
  }, [form.name, form.price]);

  function handleNameChange(value: string) {
    setForm((prev) => {
      const nextSlug = prev.slug.trim().length > 0 ? prev.slug : slugify(value);

      return {
        ...prev,
        name: value,
        slug: nextSlug,
      };
    });
  }

  function resetForm() {
    setForm(initialForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isFormValid) {
      setHasError(true);
      setFeedback("Preencha nome e preço corretamente.");
      return;
    }

    try {
      setIsSubmitting(true);
      setHasError(false);
      setFeedback(null);

      const formData = new FormData();

      formData.append("name", form.name.trim());
      formData.append("slug", slugify(form.name.trim()));
      formData.append("description", form.description.trim());
      formData.append("price", form.price);
      formData.append("category_id", form.categoryId);
      formData.append("active", String(form.active));

      if (form.imageFile) {
        formData.append("image", form.imageFile);
      }

      const response = await fetch("/api/products/add", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível cadastrar o produto.");
      }

      setFeedback("Produto cadastrado com sucesso.");
      resetForm();

    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro inesperado";
      setHasError(true);
      setFeedback(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="addProductPage">
      <header className="addProductHeader">
        <h1>Novo produto</h1>
      </header>

      <Link className="backLink" href="/dashboard">
        Voltar ao dashboard
      </Link>

      <form className="addProductForm" onSubmit={handleSubmit}>
        <label className="fieldGroup">
          <span>Nome do produto</span>
          <input
            type="text"
            value={form.name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="Nome do Produto"
            required
          />
        </label>

        <label className="fieldGroup">
          <span>Preço</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, price: event.target.value }))
            }
            placeholder="Preço (EX: 99.90)"
            required
          />
        </label>

        <label className="fieldGroup fieldGroupFull">
          <span>Descrição</span>
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
            placeholder="Descreva o produto..."
            rows={4}
          />
        </label>

        <label className="fieldGroup fieldGroupFull">
          <span>Imagem</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setForm((prev) => ({ ...prev, imageFile: file }));
            }}
          />
        </label>

        <div className="fieldGroup">
          <span>Categoria</span>

          <select
            value={form.categoryId}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                categoryId: event.target.value,
              }))
            }
            disabled={loadingCategories}
          >
            <option value="">
              {loadingCategories ? "Carregando..." : "Selecione uma categoria"}
            </option>

            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          {categoriesError ? (
            <small className="feedback feedbackError">{categoriesError}</small>
          ) : null}
        </div>

        {feedback ? (
          <p className={hasError ? "feedback feedbackError" : "feedback feedbackSuccess"}>
            {feedback}
          </p>
        ) : null}

        <div className="actionsRow">
          <button className="btn btnGhost" type="button" onClick={resetForm}>
            Limpar
          </button>

          <button className="btn btnPrimary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Salvar produto"}
          </button>
        </div>
      </form>
    </div>
  );
}
