"use server";

import { getDB, withTransaction } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { BASE_POSITIONS, canManageMember, diffList, ensureTeamTables, logTeamAction, positionOfAdmin, roleNames } from "@/lib/team/team";
import { requireTeamActor } from "@/lib/team/guard";

type Params = { params: Promise<{ id: string }> };

async function loadTarget(id: number) {
  const db = getDB();
  const res = await db.query(`SELECT id, email, role, blocked FROM admin WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

// Edita cargos, cargo-base e bloqueio de um membro — sempre respeitando a
// hierarquia: só mexe em quem está abaixo, só concede cargos abaixo, nunca
// em si mesmo, e nunca deixa a loja sem nenhum owner.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { actor, denied } = await requireTeamActor();
    if (denied) return denied;
    await ensureTeamTables();

    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return fail("INVALID_ID", 400);
    const target = await loadTarget(id);
    if (!target) return fail("NOT_FOUND", 404);
    if (target.email === actor.email) return fail("CANNOT_EDIT_SELF", 400);

    const db = getDB();
    const targetPos = await positionOfAdmin(db, id, target.role);
    if (!canManageMember(actor, { id, baseRole: target.role, position: targetPos })) return fail("MEMBER_ABOVE_YOUR_LEVEL", 403);

    const body = await req.json();
    const actorTop = actor.isOwner ? 1000 : actor.position;

    let newBase: string | null = null;
    if (body.baseRole !== undefined) {
      newBase = String(body.baseRole);
      if (!Object.hasOwn(BASE_POSITIONS, newBase)) return fail("INVALID_BASE_ROLE", 400);
      if (newBase !== target.role && (newBase === "owner" || BASE_POSITIONS[newBase] >= actor.position)) return fail("ROLE_TOO_HIGH", 403);
      // Owner é fixo: só dá pra rebaixar um owner, e o ator já passou em canManageMember.
    }

    let newRoleIds: number[] | null = null;
    if (Array.isArray(body.roleIds)) {
      const requested: number[] = body.roleIds.map(Number).filter(Number.isInteger);
      newRoleIds = requested;
      if (requested.length > 0) {
        const roles = await db.query(`SELECT id, position FROM team_roles WHERE id = ANY($1)`, [requested]);
        if (roles.rows.length !== requested.length) return fail("ROLE_NOT_FOUND", 404);
        // Só concede cargo abaixo de si; cargos acima que o membro já tinha ficam intactos abaixo.
        const current = await db.query(`SELECT role_id FROM admin_roles WHERE admin_id = $1`, [id]);
        const currentSet = new Set(current.rows.map((r) => Number(r.role_id)));
        const added = roles.rows.filter((r) => !currentSet.has(Number(r.id)));
        if (added.some((r) => Number(r.position) >= actorTop)) return fail("ROLE_TOO_HIGH", 403);
      }
    }

    let blocked: boolean | null = null;
    if (typeof body.blocked === "boolean") blocked = body.blocked;

    // Nunca deixa a loja sem owner ativo.
    if ((newBase && newBase !== "owner" && target.role === "owner") || (blocked === true && target.role === "owner")) {
      const owners = await db.query(`SELECT COUNT(*) AS n FROM admin WHERE role = 'owner' AND blocked IS NOT TRUE AND id <> $1`, [id]);
      if (Number(owners.rows[0].n) === 0) return fail("LAST_OWNER", 409);
    }

    const beforeIds = (await db.query(`SELECT role_id FROM admin_roles WHERE admin_id = $1`, [id])).rows.map((r) => Number(r.role_id));
    await withTransaction(async (client) => {
      if (newBase) await client.query(`UPDATE admin SET role = $1 WHERE id = $2`, [newBase, id]);
      if (blocked !== null) await client.query(`UPDATE admin SET blocked = $1 WHERE id = $2`, [blocked, id]);
      if (newRoleIds) {
        // Preserva cargos acima do nível do ator que ele não pode remover.
        const keep = await client.query(
          `SELECT ar.role_id FROM admin_roles ar JOIN team_roles r ON r.id = ar.role_id WHERE ar.admin_id = $1 AND r.position >= $2`,
          [id, actorTop]
        );
        const finalIds = Array.from(new Set([...newRoleIds, ...keep.rows.map((r) => Number(r.role_id))]));
        await client.query(`DELETE FROM admin_roles WHERE admin_id = $1`, [id]);
        for (const rid of finalIds) {
          await client.query(`INSERT INTO admin_roles (admin_id, role_id) VALUES ($1, $2)`, [id, rid]);
        }
      }
      const afterIds = (await client.query(`SELECT role_id FROM admin_roles WHERE admin_id = $1`, [id])).rows.map((r) => Number(r.role_id));
      const changes: Record<string, unknown> = {};
      if (newBase && newBase !== target.role) changes.baseRole = { from: target.role, to: newBase };
      if (blocked !== null && blocked !== !!target.blocked) changes.blocked = { from: !!target.blocked, to: blocked };
      const rd = diffList(beforeIds.map(String), afterIds.map(String));
      if (rd.added.length || rd.removed.length) {
        changes.roles = {
          added: await roleNames(client, rd.added.map(Number)),
          removed: await roleNames(client, rd.removed.map(Number)),
        };
      }
      await logTeamAction(client, actor.email, "member.update", target.email, { changes });
    });

    return ok({ updated: true });
  } catch (error) {
    console.error("Erro ao editar membro:", error);
    return fail("MEMBER_UPDATE_ERROR", 500);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { actor, denied } = await requireTeamActor();
    if (denied) return denied;
    await ensureTeamTables();

    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return fail("INVALID_ID", 400);
    const target = await loadTarget(id);
    if (!target) return fail("NOT_FOUND", 404);
    if (target.email === actor.email) return fail("CANNOT_REMOVE_SELF", 400);

    const db = getDB();
    const targetPos = await positionOfAdmin(db, id, target.role);
    if (!canManageMember(actor, { id, baseRole: target.role, position: targetPos })) return fail("MEMBER_ABOVE_YOUR_LEVEL", 403);

    const rolesBefore = await roleNames(db, (await db.query(`SELECT role_id FROM admin_roles WHERE admin_id = $1`, [id])).rows.map((r) => Number(r.role_id)));
    await db.query(`DELETE FROM admin_roles WHERE admin_id = $1`, [id]);
    await db.query(`DELETE FROM admin WHERE id = $1`, [id]);
    await logTeamAction(db, actor.email, "member.remove", target.email, { baseRole: target.role, roles: rolesBefore });
    return ok({ removed: true });
  } catch (error) {
    console.error("Erro ao remover membro:", error);
    return fail("MEMBER_REMOVE_ERROR", 500);
  }
}
