"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";
import { getShippingProvider, type PackageInfo } from "@/lib/shipping";

export async function POST(req: Request) {
  try {
    const { userId, denied } = await requireCustomer();
    if (denied) return denied;

    const { cep } = await req.json();
    const cepDigits = String(cep ?? "").replace(/\D/g, "");
    if (cepDigits.length !== 8) return fail("INVALID_CEP", 400);

    const db = getDB();
    const cartRes = await db.query(
      `SELECT
         c.quantity,
         COALESCE(v.weight_grams, p.weight_grams, 0) AS weight_grams,
         COALESCE(v.length_cm, p.length_cm, 16) AS length_cm,
         COALESCE(v.width_cm, p.width_cm, 12) AS width_cm,
         COALESCE(v.height_cm, p.height_cm, 4) AS height_cm
       FROM cart_items c
       JOIN products p ON p.id = c.product_id
       LEFT JOIN product_variations v ON v.id = c.variation_id
       WHERE c.user_id = $1 AND p.product_type = 'physical'`,
      [userId]
    );

    if (cartRes.rows.length === 0) return ok([]);

    const packages: PackageInfo[] = cartRes.rows.map((row) => ({
      weightGrams: Number(row.weight_grams) || 300,
      lengthCm: Number(row.length_cm),
      widthCm: Number(row.width_cm),
      heightCm: Number(row.height_cm),
      quantity: row.quantity,
    }));

    const originRes = await db.query(`SELECT origin_cep FROM store_settings ORDER BY id DESC LIMIT 1`);
    const originCep = originRes.rows[0]?.origin_cep ?? "";

    const quotes = await getShippingProvider().quote({ originCep, destinationCep: cepDigits, packages });
    return ok(quotes);
  } catch (error) {
    if (error instanceof Error && error.message === "SHIPPING_ORIGIN_NOT_CONFIGURED") {
      return fail("SHIPPING_ORIGIN_NOT_CONFIGURED", 409);
    }
    console.error("Erro ao cotar frete:", error);
    return fail("SHIPPING_QUOTE_ERROR", 500);
  }
}
