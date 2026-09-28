"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { canManagePosition, cleanPermissions, ensureTeamTables, logTeamAction } from "@/lib/team/team";
import { requireTeamActor } from "@/lib/team/guard";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function POST(req: Request) {
  try {
    const { actor, denied } = await requireTeamActor();
    if (denied) return denied;
    await ensureTeamTables();

    const body = await req.json();
    const name = String(body.name ?? "").trim().slice(0, 32);
    const color = HEX.test(String(body.color ?? "")) ? String(body.color) : "#99aab5";
    const position = Math.round(Number(body.position));
    const permissions = cleanPermissions(body.permissions);
    if (name.length < 2) return fail("INVALID_NAME", 400);
    if (!Number.isFinite(position) || position < 1 || position > 999) return fail("INVALID_POSITION", 400);
    if (!canManagePosition(actor, position)) return fail("POSITION_TOO_HIGH", 403);
    // Ninguém concede o que não tem.
    if (permissions.some((p) => !actor.permissions.has(p))) return fail("CANNOT_GRANT_UNOWNED_PERMISSION", 403);

    const db = getDB();
    const dup = await db.query(`SELECT 1 FROM team_roles WHERE LOWER(name) = LOWER($1)`, [name]);
    if (dup.rows.length > 0) return fail("ROLE_NAME_TAKEN", 409);

    const res = await db.query(
      `INSERT INTO team_roles (name, color, position, permissions, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [name, color, position, permissions, actor.email]
    );
    await logTeamAction(db, actor.email, "role.create", name, { position, permissions: { added: permissions, removed: [] } });
    return ok({ id: Number(res.rows[0].id) }, 201);
  } catch (error) {
    console.error("Erro ao criar cargo:", error);
    return fail("ROLE_CREATE_ERROR", 500);
  }
}
