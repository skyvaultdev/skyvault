"use server";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/jwt/init";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

type Params = {
  params: Promise<{ id: string }>;
};

const ROLE_LEVEL = {
  owner: 3,
  admin: 2,
  editor: 1,
};

export async function DELETE(_: Request, { params }: Params) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return fail("UNAUTHORIZED", 401);
    const { id } = await params

    const user = await verifyJWT(token);
    if (!user) return fail("INVALID_TOKEN", 401);

    if (!user.permissions?.includes("team.manage")) {
      return fail("NO_PERMISSION", 403);
    }

    const db = await getDB();
    const target = await db.query(`SELECT id,email,role FROM admin WHERE id = $1`,
      [id]
    );

    if (target.rows.length === 0) return fail("NOT_FOUND", 404);

    const targetAdmin = target.rows[0];
    if (targetAdmin.email === user.email) {
      return fail("CANNOT_REMOVE_SELF", 400);
    }

    if (ROLE_LEVEL[user.role] <= ROLE_LEVEL[targetAdmin.role]) {
      return fail("ROLE_TOO_HIGH", 403);
    }

    await db.query(`DELETE FROM admins WHERE id = $1`,
      [id]
    );

    return ok();

  } catch (e) {
    console.error(e);
    return fail("INTERNAL_ERROR", 500);
  }
}