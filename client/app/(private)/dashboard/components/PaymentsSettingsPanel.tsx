"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/icons/Icon";
import "./PaymentsSettingsPanel.css";

type FormState = {
  shippingMarkupPercent: string;
  shippingMarkupFixed: string;
  acceptsPix: boolean;
  acceptsCreditCard: boolean;
  acceptsDebitCard: boolean;
  acceptsBoleto: boolean;
};

const EMPTY_FORM: FormState = {
  shippingMarkupPercent: "", shippingMarkupFixed: "",
  acceptsPix: true, acceptsCreditCard: true, acceptsDebitCard: true, acceptsBoleto: true,
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
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/admin/payment-settings", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) {
        setForm({
          shippingMarkupPercent: toDisplayValue(json.data.shipping_markup_percent),
          shippingMarkupFixed: toDisplayValue(json.data.shipping_markup_fixed),
          acceptsPix: json.data.accepts_pix !== false,
          acceptsCreditCard: json.data.accepts_credit_card !== false,
          acceptsDebitCard: json.data.accepts_debit_card !== false,
          acceptsBoleto: json.data.accepts_boleto !== false,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setFeedback(res.ok ? { type: "success", message: "Salvo!" } : { type: "error", message: "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="settingsPanel"><p>Carregando...</p></section>;

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Pagamentos</h3>
        <p className="helperText">
          Métodos aceitos no checkout e markup sobre o frete. As credenciais do Mercado Pago (quem processa os
          pagamentos de verdade) ficam configuradas direto no servidor — veja o status em <code>/dev</code>, não aqui.
        </p>
      </div>

      <form className="paymentsForm" onSubmit={handleSubmit}>
        <div className="paymentsSection">
          <h4>Métodos aceitos no checkout</h4>
          <p className="helperText">Desligar um método aqui remove ele da tela de pagamento do cliente na hora.</p>

          <div className="paymentsMethodGrid">
            <label className={`paymentsMethodCard ${form.acceptsPix ? "active" : ""}`}>
              <span className="paymentsMethodIcon"><Icon name="pix" /></span>
              <span className="paymentsMethodInfo">
                <strong>Pix</strong>
                <span>Aprovação instantânea</span>
              </span>
              <span className="paymentsToggle">
                <input
                  type="checkbox"
                  checked={form.acceptsPix}
                  onChange={(e) => setForm({ ...form, acceptsPix: e.target.checked })}
                />
                <span className="paymentsToggleTrack" />
              </span>
            </label>

            <label className={`paymentsMethodCard ${form.acceptsCreditCard ? "active" : ""}`}>
              <span className="paymentsMethodIcon"><Icon name="card" /></span>
              <span className="paymentsMethodInfo">
                <strong>Cartão de crédito</strong>
                <span>Parcelamento disponível</span>
              </span>
              <span className="paymentsToggle">
                <input
                  type="checkbox"
                  checked={form.acceptsCreditCard}
                  onChange={(e) => setForm({ ...form, acceptsCreditCard: e.target.checked })}
                />
                <span className="paymentsToggleTrack" />
              </span>
            </label>

            <label className={`paymentsMethodCard ${form.acceptsDebitCard ? "active" : ""}`}>
              <span className="paymentsMethodIcon"><Icon name="card" /></span>
              <span className="paymentsMethodInfo">
                <strong>Cartão de débito</strong>
                <span>Débito à vista</span>
              </span>
              <span className="paymentsToggle">
                <input
                  type="checkbox"
                  checked={form.acceptsDebitCard}
                  onChange={(e) => setForm({ ...form, acceptsDebitCard: e.target.checked })}
                />
                <span className="paymentsToggleTrack" />
              </span>
            </label>

            <label className={`paymentsMethodCard ${form.acceptsBoleto ? "active" : ""}`}>
              <span className="paymentsMethodIcon"><Icon name="receipt" /></span>
              <span className="paymentsMethodInfo">
                <strong>Boleto</strong>
                <span>Compensação em até 3 dias</span>
              </span>
              <span className="paymentsToggle">
                <input
                  type="checkbox"
                  checked={form.acceptsBoleto}
                  onChange={(e) => setForm({ ...form, acceptsBoleto: e.target.checked })}
                />
                <span className="paymentsToggleTrack" />
              </span>
            </label>
          </div>
        </div>

        <div className="paymentsSection">
          <h4>Markup sobre o frete</h4>
          <p className="helperText">Somado em cima do valor de frete cotado — vira parte do total pago pelo cliente.</p>
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
        </div>

        <button type="submit" className="btn paymentsSaveBtn" disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
        {feedback && <p className={`paymentsFeedback ${feedback.type}`}>{feedback.message}</p>}
      </form>
    </section>
  );
}
