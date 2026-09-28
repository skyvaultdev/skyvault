import type { Pool, PoolClient } from "pg";
import { getDB } from "@/lib/database/db";
import { ROLES } from "@/lib/jwt/permissions";
import { ALL_PERMISSION_IDS } from "@/lib/team/permissionCatalog";

type Db = Pool | PoolClient;

// Cargos-base já existentes (admin.role) ganham uma posição de hierarquia
// fixa. Cargos personalizados escolhem a própria posição entre 1 e 999 —
// quem tem posição maior manda em quem tem menor, como no Discord.
export const BASE_POSITIONS: Record<string, number> = { owner: 1000, admin: 500, editor: 100, member: 0 };
export const BASE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", editor: "Editor", member: "Membro" };

export async function ensureTeamTables() {
  const db = getDB();
  await db.query(`
    CREATE TABLE IF NOT EXISTS team_roles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#99aab5',
      position INTEGER NOT NULL DEFAULT 1,
      permissions TEXT[] NOT NULL DEFAULT '{}',
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_roles (
      admin_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL REFERENCES team_roles(id) ON DELETE CASCADE,
      PRIMARY KEY (admin_id, role_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS team_audit_log (
      id SERIAL PRIMARY KEY,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS team_audit_created_idx ON team_audit_log (created_at DESC)`);
  // Permissões editáveis dos cargos-base (admin/editor/member). Sem linha =
  // vale o padrão de lib/jwt/permissions.ts. O owner nunca é editável.
  await db.query(`
    CREATE TABLE IF NOT EXISTS team_base_permissions (
      role TEXT PRIMARY KEY,
      permissions TEXT[] NOT NULL DEFAULT '{}',
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // admin.role tinha CHECK só com owner/admin/editor. O cargo-base "member"
  // (sem permissões próprias — o acesso vem só dos cargos personalizados)
  // precisa ser aceito; só mexe na constraint se ainda não aceita.
  const check = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'admin'::regclass AND conname = 'admin_role_check'`
  );
  if (check.rows.length > 0 && !String(check.rows[0].def).includes("member")) {
    await db.query(`ALTER TABLE admin DROP CONSTRAINT admin_role_check`);
    await db.query(`ALTER TABLE admin ADD CONSTRAINT admin_role_check CHECK (role = ANY (ARRAY['owner','admin','editor','member']))`);
  }
}

export async function logTeamAction(db: Db, actorEmail: string, action: string, target: string | null, details?: Record<string, unknown>) {
  await db.query(
    `INSERT INTO team_audit_log (actor_email, action, target, details) VALUES ($1, $2, $3, $4)`,
    [actorEmail, action, target, details ? JSON.stringify(details) : null]
  );
}

export type MemberContext = {
  adminId: number;
  email: string;
  baseRole: string;
  blocked: boolean;
  position: number;
  permissions: Set<string>;
  isOwner: boolean;
  customRoleIds: number[];
};

// Permissões efetivas = as do cargo-base (ROLES) + as de todos os cargos
// personalizados atribuídos. É isso que o middleware embute no JWT.
export async function loadMemberContext(email: string): Promise<MemberContext | null> {
  await ensureTeamTables();
  const db = getDB();
  const adminRes = await db.query(`SELECT id, role, blocked FROM admin WHERE email = $1`, [email]);
  if (adminRes.rows.length === 0) return null;
  const row = adminRes.rows[0];
  const baseRole: string = Object.hasOwn(BASE_POSITIONS, row.role) ? row.role : "member";

  const rolesRes = await db.query(
    `SELECT r.id, r.position, r.permissions FROM admin_roles ar JOIN team_roles r ON r.id = ar.role_id WHERE ar.admin_id = $1`,
    [row.id]
  );

  const permissions = new Set<string>(await getBasePermissions(baseRole));
  let position = BASE_POSITIONS[baseRole] ?? 0;
  for (const r of rolesRes.rows) {
    for (const p of r.permissions as string[]) permissions.add(p);
    position = Math.max(position, Number(r.position));
  }

  return {
    adminId: Number(row.id), email, baseRole, blocked: !!row.blocked, position, permissions,
    isOwner: baseRole === "owner",
    customRoleIds: rolesRes.rows.map((r) => Number(r.id)),
  };
}

// Permissões do cargo-base: override salvo pelo owner/admin, senão o padrão.
// Owner é sempre o padrão completo (não editável).
export async function getBasePermissions(baseRole: string): Promise<string[]> {
  const defaults: string[] = Object.hasOwn(ROLES, baseRole) ? [...ROLES[baseRole as keyof typeof ROLES]] : [];
  if (baseRole === "owner") return defaults;
  const res = await getDB().query(`SELECT permissions FROM team_base_permissions WHERE role = $1`, [baseRole]);
  return res.rows.length > 0 ? (res.rows[0].permissions as string[]) : defaults;
}

export function defaultBasePermissions(baseRole: string): string[] {
  return Object.hasOwn(ROLES, baseRole) ? [...ROLES[baseRole as keyof typeof ROLES]] : [];
}

export function diffList(before: string[], after: string[]) {
  return {
    added: after.filter((x) => !before.includes(x)),
    removed: before.filter((x) => !after.includes(x)),
  };
}

export function cleanPermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.map(String))).filter((p) => ALL_PERMISSION_IDS.includes(p));
}

// Quem gerencia só pode agir em posições estritamente abaixo da sua
// (owner gerencia tudo, exceto o próprio cargo de owner).
export function canManagePosition(actor: MemberContext, targetPosition: number): boolean {
  if (actor.isOwner) return targetPosition < BASE_POSITIONS.owner;
  return targetPosition < actor.position;
}

// Owner NÃO é atribuível por ninguém (é o cargo máximo, fixo). Entre owners
// já existentes vale a antiguidade: um owner só gerencia (remove/rebaixa)
// owners que entraram DEPOIS dele (admin.id maior) — o mais antigo nunca é
// tocado por ninguém.
export function canManageMember(actor: MemberContext, target: { id: number; baseRole: string; position: number }): boolean {
  if (target.baseRole === "owner") return actor.isOwner && actor.adminId < target.id;
  return canManagePosition(actor, target.position);
}

// Posição de um membro (pra checar se o ator pode mexer nele) a partir da
// linha de `admin`: maior entre o cargo-base e os cargos personalizados.
export async function positionOfAdmin(db: Db, adminId: number, baseRoleRaw: string): Promise<number> {
  const baseRole = Object.hasOwn(BASE_POSITIONS, baseRoleRaw) ? baseRoleRaw : "member";
  const res = await db.query(
    `SELECT COALESCE(MAX(r.position), 0) AS p FROM admin_roles ar JOIN team_roles r ON r.id = ar.role_id WHERE ar.admin_id = $1`,
    [adminId]
  );
  return Math.max(BASE_POSITIONS[baseRole], Number(res.rows[0].p));
}

export async function roleNames(db: Db, ids: number[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const res = await db.query(`SELECT name FROM team_roles WHERE id = ANY($1)`, [ids]);
  return res.rows.map((r) => String(r.name));
}
