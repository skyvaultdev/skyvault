"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

type ProductOrderPayload = { id: number; position: number };

export async function PATCH(req: Request) {
  try {
    const db = getDB();
    await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS position INT");

    const payload = (await req.json()) as ProductOrderPayload[];
    if (!Array.isArray(payload)) return fail("INVALID_PAYLOAD", 400);

    await db.query("BEGIN");
    for (const item of payload) {
      if (!Number.isFinite(item.id) || !Number.isFinite(item.position)) {
        await db.query("ROLLBACK");
        return fail("INVALID_ITEM", 400);
      }
      await db.query("UPDATE products SET position = $1 WHERE id = $2", [item.position, item.id]);
    }
    await db.query("COMMIT");

    return ok({ updated: payload.length });
  } catch (error) {
    console.error(error);
    getDB().query("ROLLBACK").catch(() => undefined);
    return fail("INTERNAL_ERROR", 500);
  }
}
