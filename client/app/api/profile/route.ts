"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requireCustomer } from "@/lib/auth/customer";

export async function GET() {
  try {
    const { email, denied } = await requireCustomer();
    if (denied) return denied;

    const db = getDB();
    const result = await db.query(`SELECT * FROM customer_profiles WHERE email = $1`, [email]);

    return ok(result.rows[0] ?? null);
  } catch (error) {
    console.error("Erro ao buscar perfil:", error);
    return fail("PROFILE_FETCH_ERROR", 500);
  }
}

export async function PUT(req: Request) {
  try {
    const { email, denied } = await requireCustomer();
    if (denied) return denied;

    const body = await req.json();
    const fullName = String(body.fullName ?? "").trim() || null;
    const phone = String(body.phone ?? "").trim() || null;
    const cep = String(body.cep ?? "").replace(/\D/g, "") || null;
    const street = String(body.street ?? "").trim() || null;
    const number = String(body.number ?? "").trim() || null;
    const complement = String(body.complement ?? "").trim() || null;
    const neighborhood = String(body.neighborhood ?? "").trim() || null;
    const city = String(body.city ?? "").trim() || null;
    const state = String(body.state ?? "").trim().toUpperCase().slice(0, 2) || null;

    const db = getDB();
    // email vem sempre do JWT (requireCustomer), nunca do body — não dá
    // pra um cliente editar o perfil de outro email.
    const result = await db.query(
      `INSERT INTO customer_profiles (email, full_name, phone, cep, street, number, complement, neighborhood, city, state, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (email) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         phone = EXCLUDED.phone,
         cep = EXCLUDED.cep,
         street = EXCLUDED.street,
         number = EXCLUDED.number,
         complement = EXCLUDED.complement,
         neighborhood = EXCLUDED.neighborhood,
         city = EXCLUDED.city,
         state = EXCLUDED.state,
         updated_at = NOW()
       RETURNING *`,
      [email, fullName, phone, cep, street, number, complement, neighborhood, city, state]
    );

    return ok(result.rows[0]);
  } catch (error) {
    console.error("Erro ao salvar perfil:", error);
    return fail("PROFILE_SAVE_ERROR", 500);
  }
}
