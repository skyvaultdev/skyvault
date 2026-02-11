"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import "./add.css";

type FormState = {
  name: string;
  slug: string;
  description: string;
  price: string;
  imageUrl: string;
  categoryId: string;
  active: boolean;
};

const initialForm: FormState = {
  name: "",
  slug: "",
  description: "",
  price: "",
  imageUrl: "",
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

  const isFormValid = useMemo(() => {
    const parsedPrice = Number(form.price);

    return (
      form.name.trim().length > 0 &&
      form.slug.trim().length > 0 &&
      Number.isFinite(parsedPrice) &&
      parsedPrice > 0
    );
  }, [form.name, form.price, form.slug]);

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
      setFeedback("Preencha nome, slug e preço corretamente.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() || null,
      price: Number(form.price),
      image_url: form.imageUrl.trim() || null,
      category_id: form.categoryId.trim() ? Number(form.categoryId) : null,
      active: form.active,
    };

    try {
      setIsSubmitting(true);
      setHasError(false);
      setFeedback(null);

      const response = await fetch("/api/products/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível cadastrar o produto.");
      }

      setFeedback("Produto cadastrado com sucesso.");
      resetForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado";
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
        <Link className="backLink" href="/dashboard">
          Voltar ao dashboard
        </Link>
      </header>

      <form className="addProductForm" onSubmit={handleSubmit}>
        <label className="fieldGroup">
          <span>Nome do produto</span>
          <input
            type="text"
            value={form.name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="Ex: Assinatura Premium"
            required
          />
        </label>

        <label className="fieldGroup">
          <span>Slug</span>
          <input
            type="text"
            value={form.slug}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, slug: slugify(event.target.value) }))
            }
            placeholder="assinatura-premium"
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
            placeholder="99.90"
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
          <span>URL da imagem</span>
          <input
            type="url"
            value={form.imageUrl}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, imageUrl: event.target.value }))
            }
            placeholder="https://site.com/imagem.png"
          />
        </label>

        <label className="fieldGroup">
          <span>ID da categoria</span>
          <input
            type="number"
            min="1"
            value={form.categoryId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, categoryId: event.target.value }))
            }
            placeholder="1"
          />
        </label>

        <label className="checkboxGroup">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, active: event.target.checked }))
            }
          />
          <span>Produto ativo</span>
        </label>

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
