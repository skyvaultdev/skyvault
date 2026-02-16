"use client";

import { useState } from "react";
import Link from "next/link";

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
    <main style={{ color: "white", padding: 24 }}>
      <h1>Novo cupom</h1>
      <Link href="/dashboard">Voltar</Link>
      <div style={{ maxWidth: 420, display: "grid", gap: 8 }}>
        <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Código" />
        <input value={percentOff} onChange={(event) => setPercentOff(event.target.value)} type="number" placeholder="% desconto" />
        <input value={usageLimit} onChange={(event) => setUsageLimit(event.target.value)} type="number" placeholder="Limite de uso" />
        <input value={minOrderValue} onChange={(event) => setMinOrderValue(event.target.value)} type="number" placeholder="Valor mínimo" />
        <button type="button" onClick={() => void submit()}>Salvar cupom</button>
      </div>
    </main>
  );
}
