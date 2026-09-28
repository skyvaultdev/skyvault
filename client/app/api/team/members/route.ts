"use server";

import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { BASE_POSITIONS, ensureTeamTables, logTeamAction, roleNames } from "@/lib/team/team";
import { requireTeamActor } from "@/lib/team/guard";

// Adiciona um membro à equipe (a pessoa precisa já ter conta na loja).
// Começa como "member" (sem permissões de base) e os cargos dão o acesso.
export async function POST(req: Request) {
  try {
    const { actor, denied } = await requireTeamActor();
    if (denied) return denied;
    await ensureTeamTables();

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const baseRole = String(body.baseRole ?? "member");
    const roleIds: number[] = Array.isArray(body.roleIds) ? body.roleIds.map(Number).filter(Number.isInteger) : [];
    if (!email.includes("@")) return fail("INVALID_EMAIL", 400);
    if (!Object.hasOwn(BASE_POSITIONS, baseRole)) return fail("INVALID_BASE_ROLE", 400);
    if (baseRole === "owner" || BASE_POSITIONS[baseRole] >= actor.position) return fail("ROLE_TOO_HIGH", 403);

    const db = getDB();
    const exists = await db.query(`SELECT 1 FROM admin WHERE email = $1`, [email]);
    if (exists.rows.length > 0) return fail("ALREADY_ADMIN", 409);

    const [d, u, g] = await Promise.all([
      db.query(`SELECT 1 FROM discuser WHERE email = $1`, [email]),
      db.query(`SELECT 1 FROM users WHERE email = $1`, [email]),
      db.query(`SELECT 1 FROM googleuser WHERE email = $1`, [email]),
    ]);
    if (d.rows.length + u.rows.length + g.rows.length === 0) return fail("USER_NOT_FOUND", 404);

    if (roleIds.length > 0) {
      const roles = await db.query(`SELECT id, position FROM team_roles WHERE id = ANY($1)`, [roleIds]);
      if (roles.rows.length !== roleIds.length) return fail("ROLE_NOT_FOUND", 404);
      if (roles.rows.some((r) => Number(r.position) >= (actor.isOwner ? 1000 : actor.position))) return fail("ROLE_TOO_HIGH", 403);
    }

    const ins = await db.query(`INSERT INTO admin (email, role) VALUES ($1, $2) RETURNING id`, [email, baseRole]);
    for (const roleId of roleIds) {
      await db.query(`INSERT INTO admin_roles (admin_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [ins.rows[0].id, roleId]);
    }
    await logTeamAction(db, actor.email, "member.add", email, { baseRole, roleIds, roleNames: await roleNames(db, roleIds) });
    return ok({ id: Number(ins.rows[0].id) }, 201);
  } catch (error) {
    console.error("Erro ao adicionar membro:", error);
    return fail("MEMBER_ADD_ERROR", 500);
  }
}
