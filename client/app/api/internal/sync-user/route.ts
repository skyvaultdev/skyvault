"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { loadMemberContext } from "@/lib/team/team";
import { config } from "@/config/configuration";
import { runWithStore } from "@/lib/tenant/tenantContext";
import { timingSafeEqualString, verifyInternalOrchestratorHeader } from "@/lib/security/internalRequest";

export async function POST(req: Request) {
  const body = await req.clone().json().catch(() => ({}));
  const sid = typeof body.sid === "number" ? body.sid : config.tenant.defaultStoreId;
  return runWithStore(sid, () => handle(req));
}

async function handle(req: Request) {
  const secret = req.headers.get("x-internal-secret");
  if (!secret || !timingSafeEqualString(secret, config.internalApi.secret)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!verifyInternalOrchestratorHeader(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  var { email } = await req.json();

  const db = getDB();
  let role = "regular_citizen";
  let permissions: string[] = [];
  let totpEnabled = false;

  // Permissões = cargo-base + cargos personalizados atribuídos (ver
  // lib/team/team.ts). Membro bloqueado perde tudo, igual antes.
  const member = await loadMemberContext(email);
  if (member && !member.blocked) {
    role = member.baseRole;
    permissions = Array.from(member.permissions).sort();

    const totpRow = await db.query(`SELECT totp_enabled FROM admin WHERE email = $1`, [email]);
    totpEnabled = !!totpRow.rows[0]?.totp_enabled;
  }

  // Loja suspensa pelos devs (ex: mensalidade em atraso) — ninguém do
  // time da loja mantém acesso à dashboard enquanto isso, mesmo owner.
  const storeRow = await db.query(`SELECT suspended FROM store_settings ORDER BY id DESC LIMIT 1`);
  if (storeRow.rows[0]?.suspended) {
    role = "regular_citizen";
    permissions = [];
  }

  return NextResponse.json({ role, permissions, totpEnabled });
}