"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { canManagePosition, cleanPermissions, diffList, ensureTeamTables, logTeamAction } from "@/lib/team/team";
import { requireTeamActor } from "@/lib/team/guard";

type Params = { params: Promise<{ id: string }> };
const HEX = /^#[0-9a-fA-F]{6}$/;

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { actor, denied } = await requireTeamActor();
    if (denied) return denied;
    await ensureTeamTables();

    const roleId = Number((await params).id);
    if (!Number.isSafeInteger(roleId) || roleId <= 0) return fail("INVALID_ID", 400);
    const db = getDB();
    const cur = await db.query(`SELECT id, name, position, permissions FROM team_roles WHERE id = $1`, [roleId]);
    if (cur.rows.length === 0) return fail("ROLE_NOT_FOUND", 404);
    const role = cur.rows[0];
    if (!canManagePosition(actor, Number(role.position))) return fail("ROLE_ABOVE_YOUR_LEVEL", 403);

    const body = await req.json();
    const name = body.name !== undefined ? String(body.name).trim().slice(0, 32) : role.name;
    const color = body.color !== undefined && HEX.test(String(body.color)) ? String(body.color) : null;
    const position = body.position !== undefined ? Math.round(Number(body.position)) : Number(role.position);
    const permissions = body.permissions !== undefined ? cleanPermissions(body.permissions) : (role.permissions as string[]);

    if (name.length < 2) return fail("INVALID_NAME", 400);
    if (!Number.isFinite(position) || position < 1 || position > 999) return fail("INVALID_POSITION", 400);
    if (!canManagePosition(actor, position)) return fail("POSITION_TOO_HIGH", 403);

    // Só pode ADICIONAR permissão que o próprio ator tem; remover é livre.
    const added = permissions.filter((p) => !(role.permissions as string[]).includes(p));
    if (added.some((p) => !actor.permissions.has(p))) return fail("CANNOT_GRANT_UNOWNED_PERMISSION", 403);

    const dup = await db.query(`SELECT 1 FROM team_roles WHERE LOWER(name) = LOWER($1) AND id <> $2`, [name, roleId]);
    if (dup.rows.length > 0) return fail("ROLE_NAME_TAKEN", 409);

    await db.query(
      `UPDATE team_roles SET name = $1, color = COALESCE($2, color), position = $3, permissions = $4 WHERE id = $5`,
      [name, color, position, permissions, roleId]
    );
    const changes: Record<string, unknown> = {};
    if (name !== role.name) changes.name = { from: role.name, to: name };
    if (position !== Number(role.position)) changes.position = { from: Number(role.position), to: position };
    if (color) changes.color = true;
    const pd = diffList(role.permissions as string[], permissions);
    if (pd.added.length || pd.removed.length) changes.permissions = pd;
    await logTeamAction(db, actor.email, "role.update", role.name, { changes });
    return ok({ updated: true });
  } catch (error) {
    console.error("Erro ao editar cargo:", error);
    return fail("ROLE_UPDATE_ERROR", 500);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { actor, denied } = await requireTeamActor();
    if (denied) return denied;
    await ensureTeamTables();

    const roleId = Number((await params).id);
    if (!Number.isSafeInteger(roleId) || roleId <= 0) return fail("INVALID_ID", 400);
    const db = getDB();
    const cur = await db.query(`SELECT name, position FROM team_roles WHERE id = $1`, [roleId]);
    if (cur.rows.length === 0) return fail("ROLE_NOT_FOUND", 404);
    if (!canManagePosition(actor, Number(cur.rows[0].position))) return fail("ROLE_ABOVE_YOUR_LEVEL", 403);

    await db.query(`DELETE FROM team_roles WHERE id = $1`, [roleId]);
    await logTeamAction(db, actor.email, "role.delete", cur.rows[0].name);
    return ok({ deleted: true });
  } catch (error) {
    console.error("Erro ao remover cargo:", error);
    return fail("ROLE_DELETE_ERROR", 500);
  }
}
