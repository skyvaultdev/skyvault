"use server";

import { NextResponse } from "next/server";
import { config } from "@/config/configuration";
import { runWithStore } from "@/lib/tenant/tenantContext";
import { listActiveStoreIds } from "@/lib/tenant/listActiveStoreIds";
import { expirePendingOrders } from "@/lib/orders/expirePendingOrders";
import { timingSafeEqualString, verifyInternalOrchestratorHeader } from "@/lib/security/internalRequest";

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
  if (!verifyInternalOrchestratorHeader(req)) {
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
