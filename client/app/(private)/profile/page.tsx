"use client";

import { useEffect, useState } from "react";
import "./profile.css";

type ProfileForm = {
  fullName: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

const EMPTY_FORM: ProfileForm = {
  fullName: "", phone: "", cep: "", street: "", number: "",
  complement: "", neighborhood: "", city: "", state: "",
};

export default function ProfilePage() {
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) {
        setForm({
          fullName: json.data.full_name || "",
          phone: json.data.phone || "",
          cep: json.data.cep || "",
          street: json.data.street || "",
          number: json.data.number || "",
          complement: json.data.complement || "",
          neighborhood: json.data.neighborhood || "",
          city: json.data.city || "",
          state: json.data.state || "",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCepBlur() {
    const digits = form.cep.replace(/\D/g, "");
    if (digits.length !== 8) return;

    setLookingUpCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((prev) => ({
          ...prev,
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
      }
    } catch {
      // busca de CEP é só conveniência — se falhar, o cliente preenche na mão
    } finally {
      setLookingUpCep(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback("");

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      setFeedback(res.ok ? "Perfil salvo!" : "Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="profilePage"><p>Carregando...</p></main>;

  return (
    <main className="profilePage">
      <form className="profileCard" onSubmit={handleSubmit}>
        <h1>Meu perfil</h1>
        <p className="profileHint">Usado pra entrega de produtos físicos e contato sobre seus pedidos.</p>

        <label>
          Nome completo
          <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </label>

        <label>
          Telefone
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>

        <div className="profileSectionTitle">Endereço de entrega</div>

        <label>
          CEP {lookingUpCep && <span className="profileCepLoading">buscando...</span>}
          <input
            value={form.cep}
            onChange={(e) => setForm({ ...form, cep: e.target.value.replace(/[^\d-]/g, "") })}
            onBlur={handleCepBlur}
            placeholder="00000-000"
            maxLength={9}
          />
        </label>

        <div className="profileRow">
          <label className="profileGrow">
            Rua
            <input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
          </label>
          <label className="profileNumber">
            Número
            <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
          </label>
        </div>

        <label>
          Complemento
          <input value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} />
        </label>

        <div className="profileRow">
          <label className="profileGrow">
            Bairro
            <input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
          </label>
          <label className="profileGrow">
            Cidade
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
          <label className="profileState">
            UF
            <input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })}
              maxLength={2}
            />
          </label>
        </div>

        <button type="submit" className="profileSaveBtn" disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
        {feedback && <p className="profileFeedback">{feedback}</p>}
      </form>
    </main>
  );
}
