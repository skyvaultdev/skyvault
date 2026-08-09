"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import "./edit.css";

type Coupon = {
  code: string;
  percent_off: number;
  usage_limit: number;
  min_order_value: number;
  expires_at: string;
  active: boolean;
};

export default function EditCouponPage() {
const router = useRouter();

  const params = useParams<{ id: string }>();
  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState("0");
  const [usageLimit, setUsageLimit] = useState("0");
  const [minOrderValue, setMinOrderValue] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    async function load() {
      var id = params.id;
      if (!id) return;
      var res = await fetch(`/api/coupon/${id}`);
      var json = await res.json();
      if (!json.ok) return;
      setCode(json.data.code);
      setPercentOff(String(json.data.percent_off));
      setUsageLimit(String(json.data.usage_limit));
      setMinOrderValue(json.data.min_order_value ? String(json.data.min_order_value) : "");
      setExpiresAt(json.data.expires_at ? json.data.expires_at.slice(0, 10) : null);
      setActive(Boolean(json.data.active));
    }
    void load();
  }, [params.id]);

  async function save() {
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

    var id = params.id;
    if (!id) return;
    await fetch(`/api/coupon/edit/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        percentOff,
        usageLimit,
        minOrderValue,
        expiresAt,
        active
      }),
    });
  }

  return (
  <main className="cupom-container">
   <button className="voltarBtn" onClick={() => router.back()}>
        &larr; Voltar
      </button>

    <div className="coupon-card">
      <h2 className="coupon-title">Editar Cupom</h2>

      <div className="coupon-form">
        <input
          className="coupon-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CÓDIGO DO CUPOM"
        />

        <input
          className="coupon-input"
          value={percentOff}
          onChange={(e) => setPercentOff(e.target.value)}
          type="number"
          placeholder="PERCENTUAL DE DESCONTO"
        />

        <input
          className="coupon-input"
          value={usageLimit}
          onChange={(e) => setUsageLimit(e.target.value)}
          type="number"
          placeholder="LIMITE DE USO"
        />

        <input
          className="coupon-input"
          value={minOrderValue}
          onChange={(e) => setMinOrderValue(e.target.value)}
          type="number"
          placeholder="VALOR MÍNIMO DO PEDIDO"
        />

        <input
          className="coupon-input"
          value={expiresAt ?? ""}
          onChange={(e) => setExpiresAt(e.target.value || null)}
          type="date"
        />

        <label className="checkbox">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span>Cupom ativo</span>
        </label>

        <button
          type="button"
          className="coupon-button"
          onClick={() => void save()}
        >
          Salvar alterações
        </button>
      </div>
    </div>
  </main>
);
}
