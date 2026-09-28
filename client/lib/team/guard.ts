import { fail } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { loadMemberContext, type MemberContext } from "@/lib/team/team";

// Toda rota de /api/team passa por aqui: exige team.manage no JWT e carrega
// o contexto REAL do ator no banco (posição, permissões) — a hierarquia é
// decidida pelo que está no banco agora, não pelo que o token diz.
export async function requireTeamActor(): Promise<{ actor: MemberContext; denied: null } | { actor: null; denied: Response }> {
  const { session, denied } = await requirePermission("team.manage");
  if (denied) return { actor: null, denied };
  const actor = await loadMemberContext(String(session?.email ?? ""));
  if (!actor || actor.blocked || !actor.permissions.has("team.manage")) {
    return { actor: null, denied: fail("NO_PERMISSION", 403) };
  }
  return { actor, denied: null };
}
