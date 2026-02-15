"use server";

import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";

type ProductOrderPayload = {
  id: number;
  position: number;
};

async function ensurePositionColumn() {
  const db = getDB();
  await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS position INT");
  return db;
}

export async function PATCH(req: Request) {
  try {
    const db = await ensurePositionColumn();
    const payload = (await req.json()) as ProductOrderPayload[];

    if (!Array.isArray(payload)) {
      return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
    }

    await db.query("BEGIN");

    for (const item of payload) {
      if (typeof item.id !== "number" || typeof item.position !== "number") {
        await db.query("ROLLBACK");
        return NextResponse.json({ error: "INVALID_ITEM" }, { status: 400 });
      }

      await db.query("UPDATE products SET position = $1 WHERE id = $2", [
        item.position,
        item.id,
      ]);
    }

    await db.query("COMMIT");

    return NextResponse.json({ ok: true });
  } catch (error) {
    const db = getDB();
    await db.query("ROLLBACK").catch(() => undefined);
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
