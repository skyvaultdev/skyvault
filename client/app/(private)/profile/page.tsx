"use client";

import { useEffect, useState } from "react";
import "./profile.css";
import { useModal } from "@/app/(components)/modal/ModalProvider";

const PIX_KEY_TYPE_LABELS: Record<string, string> = {
  cpf: "CPF", cnpj: "CNPJ", email: "Email", phone: "Telefone", random: "Chave aleatória",
};

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

function isProfileComplete(form: ProfileForm): boolean {
  return !!(form.fullName && form.cep && form.street && form.number && form.neighborhood && form.city && form.state);
}

export default function ProfilePage() {
  const modal = useModal();
  const [deletionPending, setDeletionPending] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const [feedback, setFeedback] = useState("");
  // Quando o perfil já está completo, mostra um resumo compacto em vez do
  // formulário inteiro — evita a tela lotada de campos toda vez que o
  // cliente só quer conferir o que já preencheu. "editing" força o
  // formulário aberto (primeira vez, ou clicou em editar).
  const [editing, setEditing] = useState(false);

  const [isReseller, setIsReseller] = useState(false);
  const [pixForm, setPixForm] = useState({ pixKey: "", pixKeyType: "email", pixHolderName: "" });
  const [pixSaved, setPixSaved] = useState(false);
  const [savingPix, setSavingPix] = useState(false);
  const [pixFeedback, setPixFeedback] = useState("");

  useEffect(() => {
    void loadProfile();
    void loadResellerStatus();
    void loadDeletionStatus();
  }, []);

  async function loadDeletionStatus() {
    try {
      const res = await fetch("/api/profile/request-deletion", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setDeletionPending(json.data?.status === "pending");
    } catch {
      // sem solicitação ainda — fica false
    }
  }

  async function exportData() {
    setExportingData(true);
    try {
      const res = await fetch("/api/profile/data-export");
      if (!res.ok) {
        await modal.alert("Não foi possível gerar seus dados agora. Tente novamente.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "meus-dados.json";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingData(false);
    }
  }

  async function requestDeletion() {
    const confirmed = await modal.confirm(
      "Pedir a exclusão dos seus dados? Nossa equipe vai revisar e processar o pedido — pedidos já feitos continuam no histórico, só sem seus dados pessoais (nome, e-mail, endereço).",
      { danger: true }
    );
    if (!confirmed) return;

    setRequestingDeletion(true);
    try {
      const res = await fetch("/api/profile/request-deletion", { method: "POST" });
      if (res.ok) {
        setDeletionPending(true);
      } else {
        await modal.alert("Não foi possível registrar o pedido. Tente novamente.");
      }
    } finally {
      setRequestingDeletion(false);
    }
  }

  async function loadProfile() {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) {
        const loaded: ProfileForm = {
          fullName: json.data.full_name || "",
          phone: json.data.phone || "",
          cep: json.data.cep || "",
          street: json.data.street || "",
          number: json.data.number || "",
          complement: json.data.complement || "",
          neighborhood: json.data.neighborhood || "",
          city: json.data.city || "",
          state: json.data.state || "",
        };
        setForm(loaded);
        setEditing(!isProfileComplete(loaded));
      } else {
        setEditing(true);
      }
    } finally {
      setLoading(false);
    }
  }

  // A seção de PIX só existe pra quem é revendedor aprovado — é onde o
  // owner busca a chave pra pagar comissão por QR code (ver dashboard,
  // aba Revendedores → solicitações de saque).
  async function loadResellerStatus() {
    try {
      const res = await fetch("/api/reseller/me", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const approved = json.data?.reseller?.status === "approved";
      setIsReseller(approved);
      if (approved) {
        const pixRes = await fetch("/api/reseller/pix-credentials", { cache: "no-store" });
        const pixJson = await pixRes.json();
        if (pixRes.ok && pixJson.data?.pixKey) {
          setPixForm({
            pixKey: pixJson.data.pixKey,
            pixKeyType: pixJson.data.pixKeyType || "email",
            pixHolderName: pixJson.data.pixHolderName || "",
          });
          setPixSaved(true);
        }
      }
    } catch {
      // se falhar, só não mostra a seção de PIX — não é crítico pro resto do perfil
    }
  }

  async function savePix(event: React.FormEvent) {
    event.preventDefault();
    setSavingPix(true);
    setPixFeedback("");
    try {
      const res = await fetch("/api/reseller/pix-credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pixForm),
      });
      setPixFeedback(res.ok ? "Dados de PIX salvos!" : "Erro ao salvar — confira os campos.");
      if (res.ok) setPixSaved(true);
    } finally {
      setSavingPix(false);
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
      if (res.ok) setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="profilePage"><p>Carregando...</p></main>;

  return (
    <main className="profilePage">
      <div className="profileCard">
        <h1>Meu perfil</h1>
        <p className="profileHint">Usado pra entrega de produtos físicos e contato sobre seus pedidos.</p>

        {!editing ? (
          <div className="profileSummary">
            <div className="profileSummaryRow"><span>Nome</span><strong>{form.fullName}</strong></div>
            {form.phone && <div className="profileSummaryRow"><span>Telefone</span><strong>{form.phone}</strong></div>}
            <div className="profileSummaryRow">
              <span>Endereço</span>
              <strong>
                {form.street}, {form.number}{form.complement ? ` (${form.complement})` : ""} — {form.neighborhood},
                {" "}{form.city}/{form.state} · CEP {form.cep}
              </strong>
            </div>
            <button type="button" className="profileEditBtn" onClick={() => setEditing(true)}>
              Editar informações
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="profileForm">
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

            <div className="profileFormActions">
              <button type="submit" className="profileSaveBtn" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
              {isProfileComplete(form) && (
                <button type="button" className="profileEditBtn profileCancelBtn" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              )}
            </div>
            {feedback && <p className="profileFeedback">{feedback}</p>}
          </form>
        )}
      </div>

      {isReseller && (
        <div className="profileCard">
          <h1>Dados para saque via PIX</h1>
          <p className="profileHint">
            Preencha pra receber suas comissões de revendedor — a loja usa esses dados pra gerar o QR code de
            pagamento quando aprovar sua solicitação de saque.
          </p>
          <form onSubmit={savePix} className="profileForm">
            <label>
              Tipo de chave
              <select
                className="profileSelect"
                value={pixForm.pixKeyType}
                onChange={(e) => setPixForm({ ...pixForm, pixKeyType: e.target.value })}
              >
                {Object.entries(PIX_KEY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Chave PIX
              <input value={pixForm.pixKey} onChange={(e) => setPixForm({ ...pixForm, pixKey: e.target.value })} />
            </label>
            <label>
              Nome do titular
              <input value={pixForm.pixHolderName} onChange={(e) => setPixForm({ ...pixForm, pixHolderName: e.target.value })} />
            </label>
            <button type="submit" className="profileSaveBtn" disabled={savingPix}>
              {savingPix ? "Salvando..." : pixSaved ? "Atualizar dados de PIX" : "Salvar dados de PIX"}
            </button>
            {pixFeedback && <p className="profileFeedback">{pixFeedback}</p>}
          </form>
        </div>
      )}

      <div className="profileCard">
        <h2>Privacidade e dados pessoais</h2>
        <p className="profileHint">
          Baixe uma cópia de tudo que temos sobre você, ou peça a exclusão dos seus dados pessoais (LGPD).
        </p>
        <div className="profileActionsRow">
          <button type="button" className="profileSaveBtn" onClick={() => void exportData()} disabled={exportingData}>
            {exportingData ? "Gerando..." : "Baixar meus dados"}
          </button>
          <button
            type="button"
            className="profileDangerBtn"
            onClick={() => void requestDeletion()}
            disabled={requestingDeletion || deletionPending}
          >
            {deletionPending ? "Exclusão solicitada — em análise" : requestingDeletion ? "Enviando..." : "Solicitar exclusão dos meus dados"}
          </button>
        </div>
      </div>
    </main>
  );
}
