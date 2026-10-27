"use server";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { config } from "@/config/configuration";
import { runWithStore } from "@/lib/tenant/tenantContext";
import { listActiveStoreIds } from "@/lib/tenant/listActiveStoreIds";
import { expirePendingOrders } from "@/lib/orders/expirePendingOrders";

// Mesma comparação de tempo constante usada em
// app/api/internal/sync-user/route.ts — evita vazar o segredo byte a byte
// pela latência de uma comparação normal (!==).
function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Chamado por um agendador externo (crontab, GitHub Actions schedule, etc.
// — ver README) pra expirar pedidos pending_payment velhos.
export async function POST(req: Request) {
  if (!config.cron.secret) {
    return NextResponse.json({ error: "CRON_SECRET_NOT_CONFIGURED" }, { status: 500 });
  }
  const provided = req.headers.get("x-cron-secret");
  if (!provided || !timingSafeEqualString(provided, config.cron.secret)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const storeIds = await listActiveStoreIds();

  const results = [];
  for (const storeId of storeIds) {
    const result = await runWithStore(storeId, () => expirePendingOrders());
    results.push({ storeId, ...result });
  }

  return NextResponse.json({ data: results });
}
