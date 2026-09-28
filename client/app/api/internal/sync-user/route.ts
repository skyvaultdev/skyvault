"use server";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { loadMemberContext } from "@/lib/team/team";
import { config } from "@/config/configuration";
import { runWithStore } from "@/lib/tenant/tenantContext";

// Comparação de tempo constante — uma comparação normal (`!==`) sai mais
// rápido quanto mais cedo os caracteres divergem, o que em teoria permite
// um atacante deduzir o segredo certo byte a byte medindo a latência da
// resposta. timingSafeEqual exige buffers do MESMO tamanho (senão lança
// exceção), então o tamanho é conferido antes — vazar o COMPRIMENTO do
// segredo não é um risco real aqui, só o conteúdo.
function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(req: Request) {
  const body = await req.clone().json().catch(() => ({}));
  const sid = typeof body.sid === "number" ? body.sid : config.tenant.defaultStoreId;
  return runWithStore(sid, () => handle(req));
}

async function handle(req: Request) {
  const secret = req.headers.get("x-internal-secret");
  if (!secret || !timingSafeEqualString(secret, config.jwt.secret)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  var { email } = await req.json();

  const db = getDB();
  let role = "regular_citizen";
  let permissions: string[] = [];

  // Permissões = cargo-base + cargos personalizados atribuídos (ver
  // lib/team/team.ts). Membro bloqueado perde tudo, igual antes.
  const member = await loadMemberContext(email);
  if (member && !member.blocked) {
    role = member.baseRole;
    permissions = Array.from(member.permissions).sort();
  }

  // Loja suspensa pelos devs (ex: mensalidade em atraso) — ninguém do
  // time da loja mantém acesso à dashboard enquanto isso, mesmo owner.
  const storeRow = await db.query(`SELECT suspended FROM store_settings ORDER BY id DESC LIMIT 1`);
  if (storeRow.rows[0]?.suspended) {
    role = "regular_citizen";
    permissions = [];
  }

  return NextResponse.json({ role, permissions });
}