"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
import { requireCustomer } from "@/lib/auth/customer";
import { ensureReviewsTable } from "@/lib/reviews/ensureReviewsTable";
import { ensureQuestionsTable } from "@/lib/questions/ensureQuestionsTable";

// Direito de portabilidade (LGPD art. 18) — self-service, sem precisar
// passar por staff: gera e devolve um JSON com tudo que a loja tem sobre
// o cliente, na hora.
export async function GET() {
  const { email, userId, denied } = await requireCustomer();
  if (denied) return denied;

  const db = getDB();
  await Promise.all([ensureReviewsTable(), ensureQuestionsTable()]);
  const [user, profile, addresses, orders, reviews, questions] = await Promise.all([
    db.query(`SELECT id, email, username, created_at FROM users WHERE id = $1`, [userId]),
    db.query(`SELECT full_name, phone, cep, street, number, complement, neighborhood, city, state, cpf, updated_at FROM customer_profiles WHERE email = $1`, [email]),
    db.query(`SELECT recipient_name, cep, street, number, complement, neighborhood, city, state, is_default, created_at FROM shipping_addresses WHERE user_id = $1`, [userId]),
    db.query(`SELECT id, order_number, status, total, created_at, paid_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC`, [userId]),
    db.query(`SELECT product_id, rating, comment, created_at FROM product_reviews WHERE user_id = $1 ORDER BY created_at DESC`, [userId]),
    db.query(`SELECT product_id, question, created_at FROM product_questions WHERE user_id = $1 ORDER BY created_at DESC`, [userId]),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    user: user.rows[0] ?? null,
    profile: profile.rows[0] ?? null,
    shippingAddresses: addresses.rows,
    orders: orders.rows,
    reviews: reviews.rows,
    questions: questions.rows,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="meus-dados.json"`,
    },
  });
}
