"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./add.css";

export default function AddCouponPage() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [minOrderValue, setMinOrderValue] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [active, setActive] = useState(true);

  async function submit() {
    try {
      const percent = Number(percentOff);
      const limit = Number(usageLimit);
      if (percentOff === "") {
        alert("Informe o percentual de desconto.");
        return;
      }

      if (usageLimit === "") {
        alert("Informe o limite de uso.");
        return;
      }

      if (percent <= 0 || percent > 100) {
        alert("O desconto deve estar entre 1% e 100%.");
        return;
      }

      if (limit < 0) {
        alert("O limite de uso não pode ser negativo.");
        return;
      }

      var response = await fetch("/api/coupon/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          code,
          percentOff: percent,
          usageLimit: limit,
          minOrderValue,
          active,
          expiresAt,
        }),
      });

      var text = await response.text();
      if (!response.ok) {
        alert("Erro ao criar cupom.");
        console.error(text);
        return;
      }
      alert("Cupom criado com sucesso!");

      setCode("");
      setPercentOff("");
      setUsageLimit("");
      setMinOrderValue(null);
      setExpiresAt(null);
      setActive(true);

    } catch (error) {
      console.error(error);
      alert("Erro ao conectar com o servidor.")
    }

  }

  return (
    <main className="cupom-container">
      <button className="voltarBtn" onClick={() => router.back()}>
        &larr; Voltar
      </button>

      <div className="coupon-card">
        <h2 className="coupon-title">Detalhes do Cupom</h2>
        <div className="coupon-form">
          <input
            className="coupon-input"
            value={code}
            onChange={(e) => setCode(e.target.value.trimStart().toLocaleUpperCase())}
            placeholder="INSIRA O CODIGO DO CUPOM" />
          <input
            className="coupon-input"
            type="number"
            min={1}
            max={100}
            value={percentOff}
            onChange={(e) => setPercentOff(e.target.value)}
            placeholder="PERCENTUAL DE DESCONTO"
          />
          <input
            className="coupon-input"
            type="number"
            min={0}
            value={usageLimit}
            onChange={(e) => setUsageLimit(e.target.value)}
            placeholder="LIMITE DE USO"
          />
          <input
            className="coupon-input"
            type="number"
            min={0}
            step="0.01"
            value={minOrderValue ?? ""}
            onChange={(e) =>
              setMinOrderValue(e.target.value ? Number(e.target.value) : null)
            }
            placeholder="VALOR MINIMO DO PEDIDO"
          />
          <input
            className="coupon-input"
            type="date"
            value={expiresAt ?? ""}
            onChange={(e) => setExpiresAt(e.target.value || null)}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />  <p className="checkbox-label">Cupom ativo</p>
          </label>
          <button
            type="button"
            className="coupon-button"
            onClick={submit}
          >
            Salvar Cupom
          </button>
        </div>
      </div>

    </main>
  )
}