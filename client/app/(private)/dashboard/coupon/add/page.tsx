"use client";

import { useState } from "react";
import Link from "next/link";
import '../coupon.css';

export default function AddCouponPage() {
  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState("10");
  const [usageLimit, setUsageLimit] = useState("0");
  const [minOrderValue, setMinOrderValue] = useState("");

  async function submit() {
    await fetch("/api/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        percentOff: Number(percentOff),
        usageLimit: Number(usageLimit),
        minOrderValue: minOrderValue ? Number(minOrderValue) : null,
      }),
    });
  }

  return (
    <main className="coupon-page-container">
      <Link href="/dashboard" className="back-link">
        ← Voltar
      </Link>
      <div className="coupon-card">
        <div className="coupon-badge">Novo Cupom</div>

        <div className="coupon-form-wrapper">
          <div className="coupon-info">
            <h3 className="coupon-discount">Configurar Desconto</h3>

            <div className="input-group">
              <input
                className="coupon-code-input"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="CÓDIGO DO CUPOM"
              />

              <div className="input-row">
                <div className="field">
                  <label>Desconto (%)</label>
                  <input
                    className="coupon-field"
                    value={percentOff}
                    onChange={(event) => setPercentOff(event.target.value)}
                    type="number"
                    placeholder="Ex: 20"
                  />
                </div>

                <div className="field">
                  <label>Limite de Uso</label>
                  <input
                    className="coupon-field"
                    value={usageLimit}
                    onChange={(event) => setUsageLimit(event.target.value)}
                    type="number"
                    placeholder="Ex: 100"
                  />
                </div>
              </div>

              <div className="field">
                <label>Valor Mínimo do Pedido</label>
                <input
                  className="coupon-field"
                  value={minOrderValue}
                  onChange={(event) => setMinOrderValue(event.target.value)}
                  type="number"
                  placeholder="R$ 0,00"
                />
              </div>
            </div>
          </div>

          <div className="coupon-actions-container">
            <button
              className="coupon-btn"
              type="button"
              onClick={() => void submit()}
            >
              Salvar cupom
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
