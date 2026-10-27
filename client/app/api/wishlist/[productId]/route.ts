"use server";

import { fail, ok } from "@/lib/api/response";
import { getDB } from "@/lib/database/db";
import { requireCustomer } from "@/lib/auth/customer";

type Params = { params: Promise<{ productId: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { userId, denied } = await requireCustomer();
  if (denied) return denied;

  const { productId } = await params;
  const productIdNum = Number(productId);
  if (!productIdNum) return fail("INVALID_PRODUCT_ID", 400);

  const db = getDB();
  await db.query(`DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2`, [userId, productIdNum]);
  return ok({ removed: true });
}
