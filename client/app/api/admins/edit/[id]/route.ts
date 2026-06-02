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
} as const;

type Role = keyof typeof ROLE_LEVEL;

export async function PATCH(request: Request, { params }: Params) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return fail("UNAUTHORIZED", 401);

    const user = await verifyJWT(token);
    if (!user) return fail("INVALID_TOKEN", 401);
    if (!user.permissions?.includes("team.manage")) return fail("NO_PERMISSION", 403);

    const { id } = await params;
    const body = await request.json();
    const { role: newRole } = body;

    if (!newRole || !["owner", "admin", "editor"].includes(newRole)) {
      return fail("INVALID_ROLE", 400);
    }

    const db = await getDB();
    const targetResult = await db.query(`SELECT id, email, role FROM admin WHERE id = $1`, [id]);
    if (targetResult.rows.length === 0) return fail("NOT_FOUND", 404);

    const targetAdmin = targetResult.rows[0];
    
    if (targetAdmin.email === user.email) return fail("CANNOT_EDIT_SELF", 400);

    const ROLE_LEVEL = { owner: 3, admin: 2, editor: 1 };
    const userLevel = ROLE_LEVEL[user.role as keyof typeof ROLE_LEVEL];
    const targetLevel = ROLE_LEVEL[targetAdmin.role as keyof typeof ROLE_LEVEL];
    const newLevel = ROLE_LEVEL[newRole as keyof typeof ROLE_LEVEL];

    if (userLevel <= targetLevel) {
      return fail("ROLE_TOO_HIGH", 403);
    }

    if (newLevel >= userLevel) {
      return fail("CANNOT_PROMOTE_TO_SAME_OR_HIGHER", 403);
    }

    await db.query(`UPDATE admin SET role = $1 WHERE id = $2`, [newRole, id]);
    return ok();
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
  }
}