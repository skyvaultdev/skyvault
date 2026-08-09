"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

type ProductOrderPayload = {
  id: number;
  position: number;
};


export async function PATCH(req: Request) {
  let db;
  try {
    db = getDB();
    var body = await req.json();
    var payload: ProductOrderPayload[] = [];
    if (!Array.isArray(body)) {
      return fail("INVALID_PAYLOAD - Expected array", 400);
    }

    payload = body.map((item: any) => ({
      id: item.id || item.productId,
      position: item.position
    }));

    if (payload.some(item => !item.id)) {
      return fail("INVALID_PAYLOAD - Missing id", 400);
    }

    for (var item of payload) {
      await db.query(
        "UPDATE products SET position = $1 WHERE id = $2",
        [item.position, item.id]
      );
    }

    return ok({ updated: payload.length });

  } catch (error) {
    console.error("ERRO_DB_ORDER:", error);
    if (db) {
      await db.query("ROLLBACK").catch(() => {});
    }
    return fail("INTERNAL_ERROR", 500);
  }
}