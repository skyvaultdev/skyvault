"use server";

import { NextResponse } from "next/server";
import { getOrCreatePool } from "@/lib/database/pool";

// Health check de infraestrutura (load balancer, uptime monitor, etc.) —
// usa o pool cru (getOrCreatePool), não getDB(): isso aqui só precisa
// confirmar que o Postgres responde, não depende de resolver qual loja
// está atendendo (getDB() exige contexto de tenant, que um healthcheck
// externo não tem).
export async function GET() {
  try {
    await getOrCreatePool().query("SELECT 1");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[health] banco indisponível:", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
