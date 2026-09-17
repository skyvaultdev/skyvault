"use client";

import { useEffect, useState } from "react";
import "./GeneralSettingsPanel.css";

type Tier = { minSubtotal: number; percent: number };

const MAX_TIERS = 5;

export default function GeneralSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const [tiers, setTiers] = useState<Tier[]>([]);
  const [freeShippingEnabled, setFreeShippingEnabled] = useState(true);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("150");
  const [minOrderValue, setMinOrderValue] = useState("0");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/promotion-settings", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) {
        setTiers(Array.isArray(json.data.discountTiers) ? json.data.discountTiers : []);
        setFreeShippingEnabled(json.data.freeShippingEnabled !== false);
        setFreeShippingThreshold(String(json.data.freeShippingThreshold ?? 150));
        setMinOrderValue(String(json.data.minOrderValue ?? 0));
      }
    } finally {
      setLoading(false);
    }
  }

  function updateTier(index: number, patch: Partial<Tier>) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function addTier() {
    if (tiers.length >= MAX_TIERS) return;
    setTiers((prev) => [...prev, { minSubtotal: 0, percent: 0 }]);
  }

  function removeTier(index: number) {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setFeedback("");
    try {
      const res = await fetch("/api/admin/promotion-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountTiers: tiers,
          freeShippingEnabled,
          freeShippingThreshold: Number(freeShippingThreshold) || 0,
          minOrderValue: Number(minOrderValue) || 0,
        }),
      });
      setFeedback(res.ok ? "Salvo!" : "Erro ao salvar — confira os valores.");
      if (res.ok) await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="settingsPanel"><p>Carregando...</p></section>;

  const sortedPreview = [...tiers].sort((a, b) => a.minSubtotal - b.minSubtotal);

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Geral</h3>
        <p className="helperText">
          Configurações de promoções e vendas da loja — os degraus de desconto e o frete grátis aparecem
          automaticamente pro cliente no checkout, com uma barra de progresso mostrando o quanto falta.
        </p>
      </div>

      <div className="generalSection">
        <h4>Desconto progressivo por valor do carrinho</h4>
        <p className="helperText">
          Quanto mais o cliente compra, maior o desconto automático — sem precisar de cupom. Não se
          acumula com cupons: se os dois se aplicarem, vale o maior desconto entre os dois.
        </p>

        <div className="tierList">
          {tiers.map((tier, i) => (
            <div key={i} className="tierRow">
              <label>
                A partir de
                <div className="tierInputPrefix">
                  <span>R$</span>
                  <input
                    type="number"
                    min={0}
                    value={tier.minSubtotal}
                    onChange={(e) => updateTier(i, { minSubtotal: Number(e.target.value) })}
                  />
                </div>
              </label>
              <label>
                Desconto
                <div className="tierInputSuffix">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={tier.percent}
                    onChange={(e) => updateTier(i, { percent: Number(e.target.value) })}
                  />
                  <span>%</span>
                </div>
              </label>
              <button type="button" className="tierRemoveBtn" onClick={() => removeTier(i)} title="Remover degrau">
                ✕
              </button>
            </div>
          ))}
          {tiers.length === 0 && <p className="emptyMsg">Nenhum degrau configurado — desconto automático desativado.</p>}
        </div>

        {tiers.length < MAX_TIERS && (
          <button type="button" className="btnSecondary" onClick={addTier}>+ Adicionar degrau</button>
        )}

        {sortedPreview.length > 0 && (
          <p className="helperText tierPreview">
            Prévia: {sortedPreview.map((t, i) => (
              <span key={i}>{i > 0 ? " · " : ""}R$ {t.minSubtotal.toLocaleString("pt-BR")}+ → {t.percent}% off</span>
            ))}
          </p>
        )}
      </div>

      <div className="generalSection">
        <h4>Frete grátis</h4>
        <label className="generalCheckboxRow">
          <input type="checkbox" checked={freeShippingEnabled} onChange={(e) => setFreeShippingEnabled(e.target.checked)} />
          Ativar frete grátis acima de um valor
        </label>
        {freeShippingEnabled && (
          <label>
            Valor mínimo do carrinho
            <div className="tierInputPrefix">
              <span>R$</span>
              <input type="number" min={0} value={freeShippingThreshold} onChange={(e) => setFreeShippingThreshold(e.target.value)} />
            </div>
          </label>
        )}
      </div>

      <div className="generalSection">
        <h4>Pedido mínimo</h4>
        <p className="helperText">Valor mínimo do carrinho pra conseguir finalizar a compra. Deixe 0 pra não exigir mínimo.</p>
        <label>
          Valor mínimo
          <div className="tierInputPrefix">
            <span>R$</span>
            <input type="number" min={0} value={minOrderValue} onChange={(e) => setMinOrderValue(e.target.value)} />
          </div>
        </label>
      </div>

      <button className="btn" onClick={save} disabled={saving}>
        {saving ? "Salvando..." : "Salvar configurações"}
      </button>
      {feedback && <p className="helperText">{feedback}</p>}
    </section>
  );
}
