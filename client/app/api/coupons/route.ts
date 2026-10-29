"use server";

import { fail, ok } from "@/lib/api/response";
import { ensureCouponsSchema } from "@/lib/coupons/ensureCouponsSchema";

// Pública de propósito (usada no checkout e na página de produto pra
// validar um código), mas só devolve o cupom exato pedido — nunca a
// tabela inteira, pra não vazar códigos, limites de uso e valor mínimo de
// outros cupons.
//
// O CRUD de admin (criar/listar/editar/remover cupom) vive em
// app/api/coupon/* (singular) — essa rota (plural) só tem esse GET
// público; o POST que existia aqui era um duplicado exato de
// app/api/coupon/add e foi removido.
export async function GET(req: Request) {
  try {
    var { searchParams } = new URL(req.url);
    var code = searchParams.get("code")?.trim().toUpperCase();
    if (!code) return fail("MISSING_CODE", 400);

    const db = await ensureCouponsSchema();
    const result = await db.query(
      `SELECT code, percent_off, min_order_value FROM coupons
       WHERE code = $1 AND active = true AND (expires_at IS NULL OR expires_at > NOW())
         AND (usage_limit = 0 OR used_count < usage_limit)`,
      [code]
    );
    if (result.rows.length === 0) return fail("COUPON_NOT_FOUND", 404);
    return ok(result.rows[0]);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}
