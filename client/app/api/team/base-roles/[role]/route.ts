"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { BASE_POSITIONS, cleanPermissions, defaultBasePermissions, diffList, ensureTeamTables, getBasePermissions, logTeamAction } from "@/lib/team/team";
import { requireTeamActor } from "@/lib/team/guard";

type Params = { params: Promise<{ role: string }> };

// Edita as permissões de um cargo padrão (admin/editor/membro). O owner é
// o cargo máximo e nunca pode ser alterado.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { actor, denied } = await requireTeamActor();
    if (denied) return denied;
    await ensureTeamTables();

    const role = (await params).role;
    if (!Object.hasOwn(BASE_POSITIONS, role)) return fail("INVALID_BASE_ROLE", 400);
    if (role === "owner") return fail("OWNER_LOCKED", 403);
    if (BASE_POSITIONS[role] >= actor.position) return fail("ROLE_ABOVE_YOUR_LEVEL", 403);

    const body = await req.json();
    const db = getDB();
    const before = await getBasePermissions(role);
    const reset = body.reset === true;
    if (!reset && !Array.isArray(body.permissions)) return fail("INVALID_PERMISSIONS", 400);
    const permissions = reset ? defaultBasePermissions(role) : cleanPermissions(body.permissions);

    const diff = diffList(before, permissions);
    if (diff.added.some((p) => !actor.permissions.has(p))) return fail("CANNOT_GRANT_UNOWNED_PERMISSION", 403);

    if (reset) await db.query(`DELETE FROM team_base_permissions WHERE role = $1`, [role]);
    else {
      await db.query(
        `INSERT INTO team_base_permissions (role, permissions, updated_by, updated_at) VALUES ($1,$2,$3,NOW())
         ON CONFLICT (store_id, role) DO UPDATE SET permissions = EXCLUDED.permissions, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [role, permissions, actor.email]
      );
    }
    await logTeamAction(db, actor.email, reset ? "baseRole.reset" : "baseRole.update", role, { changes: { permissions: diff } });
    return ok({ updated: true });
  } catch (error) {
    console.error("Erro ao editar cargo padrão:", error);
    return fail("BASE_ROLE_UPDATE_ERROR", 500);
  }
}
