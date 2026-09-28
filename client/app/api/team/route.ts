"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { ensureTeamTables, BASE_POSITIONS, BASE_LABELS, getBasePermissions, defaultBasePermissions } from "@/lib/team/team";
import { requireTeamActor } from "@/lib/team/guard";
import { PERMISSION_CATALOG } from "@/lib/team/permissionCatalog";

export async function GET() {
  try {
    const { actor, denied } = await requireTeamActor();
    if (denied) return denied;

    await ensureTeamTables();
    const db = getDB();

    const [rolesRes, membersRes, assignRes] = await Promise.all([
      db.query(`SELECT id, name, color, position, permissions FROM team_roles ORDER BY position DESC, name ASC`),
      db.query(`SELECT id, email, role, blocked FROM admin ORDER BY email ASC`),
      db.query(`SELECT admin_id, role_id FROM admin_roles`),
    ]);

    const baseKeys = Object.keys(BASE_POSITIONS);
    const basePerms: Record<string, string[]> = {};
    for (const k of baseKeys) basePerms[k] = await getBasePermissions(k);

    const rolePerms = new Map<number, string[]>(rolesRes.rows.map((r) => [Number(r.id), r.permissions as string[]]));
    const rolePos = new Map<number, number>(rolesRes.rows.map((r) => [Number(r.id), Number(r.position)]));
    const byAdmin = new Map<number, number[]>();
    for (const a of assignRes.rows) {
      const list = byAdmin.get(Number(a.admin_id)) ?? [];
      list.push(Number(a.role_id));
      byAdmin.set(Number(a.admin_id), list);
    }

    const members = membersRes.rows.map((m) => {
      const baseRole: string = Object.hasOwn(BASE_POSITIONS, m.role) ? m.role : "member";
      const roleIds = byAdmin.get(Number(m.id)) ?? [];
      const position = Math.max(BASE_POSITIONS[baseRole], ...roleIds.map((id) => rolePos.get(id) ?? 0));
      const effective = Array.from(new Set([...basePerms[baseRole], ...roleIds.flatMap((id) => rolePerms.get(id) ?? [])]));
      return { id: Number(m.id), email: m.email, baseRole, blocked: !!m.blocked, roleIds, position, permissions: effective };
    });

    return ok({
      catalog: PERMISSION_CATALOG,
      baseRoles: baseKeys.map((k) => ({
        id: k, label: BASE_LABELS[k], position: BASE_POSITIONS[k],
        permissions: basePerms[k], defaults: defaultBasePermissions(k), locked: k === "owner",
      })),
      me: { id: actor.adminId, email: actor.email, position: actor.position, isOwner: actor.isOwner, permissions: Array.from(actor.permissions) },
      roles: rolesRes.rows.map((r) => ({ ...r, id: Number(r.id), position: Number(r.position) })),
      members,
    });
  } catch (error) {
    console.error("Erro ao carregar equipe:", error);
    return fail("TEAM_FETCH_ERROR", 500);
  }
}
