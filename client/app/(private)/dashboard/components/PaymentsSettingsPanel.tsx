"use client";

import { useEffect, useState } from "react";
import "./PaymentsSettingsPanel.css";

type FormState = {
  platformFeePercent: string;
  platformFeeFixed: string;
  shippingMarkupPercent: string;
  shippingMarkupFixed: string;
  acceptsPix: boolean;
  acceptsCreditCard: boolean;
  acceptsBoleto: boolean;
};

const EMPTY_FORM: FormState = {
  platformFeePercent: "", platformFeeFixed: "",
  shippingMarkupPercent: "", shippingMarkupFixed: "",
  acceptsPix: true, acceptsCreditCard: false, acceptsBoleto: false,
};

// Aceita apenas dígitos e uma vírgula decimal (formato BR: 12,50)
function sanitizeDecimalInput(raw: string): string {
  let value = raw.replace(/[^0-9,]/g, "");
  const parts = value.split(",");
  if (parts.length > 2) {
    value = parts[0] + "," + parts.slice(1).join("");
  }
  return value;
}

function toDisplayValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const num = Number(raw);
  if (Number.isNaN(num) || num === 0) return "";
  return String(raw).replace(".", ",");
}

export default function PaymentsSettingsPanel() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    void load();
  }, []);

 async function load() {
  try {
    const res = await fetch("/api/admin/payment-settings", { cache: "no-store" });
    const json = await res.json();
    if (res.ok && json.data) {
      setForm({
        platformFeePercent: toDisplayValue(json.data.platform_fee_percent),
        platformFeeFixed: toDisplayValue(json.data.platform_fee_fixed),
        shippingMarkupPercent: toDisplayValue(json.data.shipping_markup_percent),
        shippingMarkupFixed: toDisplayValue(json.data.shipping_markup_fixed),
        acceptsPix: Boolean(json.data.accepts_pix),
        acceptsCreditCard: Boolean(json.data.accepts_credit_card),
        acceptsBoleto: Boolean(json.data.accepts_boleto),
      });
    }
  } finally {
    setLoading(false);
  }
}

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback("");

    try {
      const res = await fetch("/api/admin/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setFeedback(res.ok ? "Salvo!" : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="settingsPanel"><p>Carregando...</p></section>;

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Pagamentos</h3>
        <p className="helperText">Métodos aceitos no checkout e taxas cobradas por venda/frete.</p>
      </div>

      <form className="paymentsForm" onSubmit={handleSubmit}>
        <div className="paymentsSection">
          <h4>Métodos aceitos</h4>
          <label className="paymentsCheckboxRow">
            <input
              type="checkbox"
              checked={form.acceptsPix}
              onChange={(e) => setForm({ ...form, acceptsPix: e.target.checked })}
            />
            Pix
          </label>
          <label className="paymentsCheckboxRow">
            <input
              type="checkbox"
              checked={form.acceptsCreditCard}
              onChange={(e) => setForm({ ...form, acceptsCreditCard: e.target.checked })}
            />
            Cartão de crédito
          </label>
          <label className="paymentsCheckboxRow">
            <input
              type="checkbox"
              checked={form.acceptsBoleto}
              onChange={(e) => setForm({ ...form, acceptsBoleto: e.target.checked })}
            />
            Boleto
          </label>
          <p className="helperText">
            Hoje só o Pix é processado de fato (via EfiBank, ainda em modo de teste) — os outros métodos ficam
            preparados pra quando a integração cobrir cartão/boleto.
          </p>
        </div>

        <div className="paymentsSection">
          <h4>Taxa da plataforma (sobre cada venda)</h4>
          <div className="paymentsFieldRow">
            <label>
              Percentual (%)
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={form.platformFeePercent}
                onChange={(e) => setForm({ ...form, platformFeePercent: sanitizeDecimalInput(e.target.value) })}
              />
            </label>
            <label>
              Fixo (R$)
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={form.platformFeeFixed}
                onChange={(e) => setForm({ ...form, platformFeeFixed: sanitizeDecimalInput(e.target.value) })}
              />
            </label>
          </div>
          <p className="helperText">Descontada do saldo antes de creditar — não aparece no total pago pelo cliente.</p>
        </div>

        <div className="paymentsSection">
          <h4>Markup sobre o frete</h4>
          <div className="paymentsFieldRow">
            <label>
              Percentual (%)
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={form.shippingMarkupPercent}
                onChange={(e) => setForm({ ...form, shippingMarkupPercent: sanitizeDecimalInput(e.target.value) })}
              />
            </label>
            <label>
              Fixo (R$)
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={form.shippingMarkupFixed}
                onChange={(e) => setForm({ ...form, shippingMarkupFixed: sanitizeDecimalInput(e.target.value) })}
              />
            </label>
          </div>
          <p className="helperText">Somado em cima do valor de frete cotado — vira parte do total pago pelo cliente.</p>
        </div>

        <button type="submit" className="btn" disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
        {feedback && <p className="helperText">{feedback}</p>}
      </form>
    </section>
  );
}