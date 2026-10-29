"use server";

import { NextResponse } from "next/server";
import { getOrCreatePool } from "@/lib/database/pool";
import { getRedisStatus } from "@/lib/security/rateLimit";

// Health check de infraestrutura (load balancer, uptime monitor, etc.) —
// usa o pool cru (getOrCreatePool), não getDB(): isso aqui só precisa
// confirmar que o Postgres responde, não depende de resolver qual loja
// está atendendo (getDB() exige contexto de tenant, que um healthcheck
// externo não tem).
//
// `redis` (item B4) é informativo, não derruba o health check — Redis
// "not_configured"/"unreachable" é degradação (rate limit cai pro
// fallback em memória), não indisponibilidade do serviço. `ok` no nível
// raiz continua só sobre o banco, que é o que de fato bloqueia o app.
export async function GET() {
  const redis = await getRedisStatus();

  try {
    await getOrCreatePool().query("SELECT 1");
    return NextResponse.json({ ok: true, redis });
  } catch (error) {
    console.error("[health] banco indisponível:", error);
    return NextResponse.json({ ok: false, redis }, { status: 503 });
  }
}
