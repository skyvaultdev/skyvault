"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function EditCouponPage() {
  const params = useParams<{ id: string }>();
  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState("0");
  const [usageLimit, setUsageLimit] = useState("0");
  const [minOrderValue, setMinOrderValue] = useState("");

  useEffect(() => {
    async function load() {
      const id = params.id;
      if (!id) return;
      const res = await fetch(`/api/coupons/${id}`);
      const json = await res.json();
      if (!json.ok) return;
      setCode(json.data.code);
      setPercentOff(String(json.data.percent_off));
      setUsageLimit(String(json.data.usage_limit));
      setMinOrderValue(json.data.min_order_value ? String(json.data.min_order_value) : "");
    }
    void load();
  }, [params.id]);

  async function save() {
    const id = params.id;
    if (!id) return;
    await fetch(`/api/coupons/${id}`, {
      method: "PATCH",
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
    <main style={{ color: "white", padding: 24 }}>
      <h1>Editar cupom</h1>
      <Link href="/dashboard">Voltar</Link>
      <div style={{ maxWidth: 420, display: "grid", gap: 8 }}>
        <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
        <input value={percentOff} onChange={(event) => setPercentOff(event.target.value)} type="number" />
        <input value={usageLimit} onChange={(event) => setUsageLimit(event.target.value)} type="number" />
        <input value={minOrderValue} onChange={(event) => setMinOrderValue(event.target.value)} type="number" />
        <button type="button" onClick={() => void save()}>Salvar alterações</button>
      </div>
    </main>
  );
}
