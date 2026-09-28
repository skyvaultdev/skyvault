"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./TeamPanel.css";
import { useModal } from "@/app/(components)/modal/ModalProvider";

type Perm = { id: string; label: string; description: string; group: string };
type BaseRole = { id: string; label: string; position: number; permissions: string[]; defaults: string[]; locked: boolean };
type Role = { id: number; name: string; color: string; position: number; permissions: string[] };
type Member = { id: number; email: string; baseRole: string; blocked: boolean; roleIds: number[]; position: number; permissions: string[] };
type Me = { id: number; email: string; position: number; isOwner: boolean; permissions: string[] };
type AuditItem = { id: number; actor_email: string; action: string; target: string | null; details: Record<string, unknown> | null; created_at: string };

const ACTION_LABELS: Record<string, string> = {
  "role.create": "criou o cargo",
  "role.update": "editou o cargo",
  "role.delete": "excluiu o cargo",
  "member.add": "adicionou o membro",
  "member.update": "alterou o membro",
  "member.remove": "removeu o membro",
  "baseRole.update": "editou as permissões do cargo padrão",
  "baseRole.reset": "restaurou as permissões padrão do cargo",
};

type Diff = { added?: string[]; removed?: string[] };
type FromTo = { from: unknown; to: unknown };

const ERROR_LABELS: Record<string, string> = {
  POSITION_TOO_HIGH: "Você só pode criar/editar cargos abaixo do seu nível na hierarquia.",
  ROLE_ABOVE_YOUR_LEVEL: "Esse cargo está acima do seu nível.",
  MEMBER_ABOVE_YOUR_LEVEL: "Esse membro está no seu nível ou acima dele.",
  ROLE_TOO_HIGH: "Você não pode conceder um cargo do seu nível ou acima.",
  CANNOT_GRANT_UNOWNED_PERMISSION: "Você não pode conceder permissões que você mesmo não tem.",
  CANNOT_EDIT_SELF: "Você não pode alterar a si mesmo.",
  CANNOT_REMOVE_SELF: "Você não pode remover a si mesmo.",
  LAST_OWNER: "A loja precisa de pelo menos um owner ativo.",
  OWNER_LOCKED: "O cargo Owner é o máximo e não pode ser editado.",
  ROLE_NAME_TAKEN: "Já existe um cargo com esse nome.",
  ALREADY_ADMIN: "Essa pessoa já está na equipe.",
  USER_NOT_FOUND: "Não existe conta com esse email — a pessoa precisa entrar na loja uma vez antes.",
  INVALID_NAME: "Nome do cargo muito curto.",
  INVALID_POSITION: "A posição deve estar entre 1 e 999.",
};

const emptyRole = { id: 0, name: "", color: "#5865f2", position: 1, permissions: [] as string[] };

export default function TeamPanel() {
  const modal = useModal();
  const [tab, setTab] = useState<"members" | "roles" | "audit">("members");
  const [catalog, setCatalog] = useState<Perm[]>([]);
  const [baseRoles, setBaseRoles] = useState<BaseRole[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [roleForm, setRoleForm] = useState<typeof emptyRole | null>(null);
  const [memberForm, setMemberForm] = useState<{ id: number; email: string; baseRole: string; roleIds: number[]; blocked: boolean } | null>(null);
  const [newMember, setNewMember] = useState({ email: "", baseRole: "member" });
  const [busy, setBusy] = useState(false);

  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) {
        setCatalog(json.data.catalog);
        setBaseRoles(json.data.baseRoles);
        setRoles(json.data.roles);
        setMembers(json.data.members);
        setMe(json.data.me);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async (page: number) => {
    const res = await fetch(`/api/team/audit?page=${page}`, { cache: "no-store" });
    const json = await res.json();
    if (res.ok && json.data) {
      setAudit(json.data.items);
      setAuditTotal(json.data.total);
      setAuditPage(json.data.page);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === "audit") void loadAudit(1); }, [tab, loadAudit]);

  const myTop = me ? (me.isOwner ? 1000 : me.position) : 0;
  const canManage = (position: number) => (me?.isOwner ? position < 1000 : position < (me?.position ?? 0));
  const canManageMember = (m: Member) =>
    m.email !== me?.email && (m.baseRole === "owner" ? !!me?.isOwner && me.id < m.id : canManage(m.position));
  const permLabel = useMemo(() => new Map(catalog.map((p) => [p.id, p.label])), [catalog]);
  const [baseForm, setBaseForm] = useState<{ id: string; label: string; permissions: string[] } | null>(null);
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const groups = useMemo(() => {
    const g = new Map<string, Perm[]>();
    for (const p of catalog) g.set(p.group, [...(g.get(p.group) ?? []), p]);
    return Array.from(g.entries());
  }, [catalog]);

  async function call(url: string, method: string, body?: unknown, okMsg?: string) {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await modal.alert(ERROR_LABELS[json.error] ?? "Não foi possível concluir a ação.");
        return false;
      }
      if (okMsg) await modal.alert(okMsg);
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function saveRole() {
    if (!roleForm) return;
    const body = { name: roleForm.name, color: roleForm.color, position: roleForm.position, permissions: roleForm.permissions };
    const done = roleForm.id
      ? await call(`/api/team/roles/${roleForm.id}`, "PATCH", body)
      : await call("/api/team/roles", "POST", body);
    if (done) setRoleForm(null);
  }

  async function deleteRole(r: Role) {
    if (!(await modal.confirm(`Excluir o cargo "${r.name}"? Quem tem esse cargo perde as permissões dele.`, { danger: true }))) return;
    await call(`/api/team/roles/${r.id}`, "DELETE");
  }

  async function saveMember() {
    if (!memberForm) return;
    const done = await call(`/api/team/members/${memberForm.id}`, "PATCH", {
      baseRole: memberForm.baseRole, roleIds: memberForm.roleIds, blocked: memberForm.blocked,
    });
    if (done) setMemberForm(null);
  }

  async function removeMember(m: Member) {
    if (!(await modal.confirm(`Remover ${m.email} da equipe?`, { danger: true }))) return;
    await call(`/api/team/members/${m.id}`, "DELETE");
  }

  async function addMember() {
    const email = newMember.email.trim();
    if (!email) return;
    if (await call("/api/team/members", "POST", { email, baseRole: newMember.baseRole, roleIds: [] })) {
      setNewMember({ email: "", baseRole: "member" });
    }
  }

  function togglePerm(id: string) {
    setRoleForm((f) => f && ({ ...f, permissions: f.permissions.includes(id) ? f.permissions.filter((p) => p !== id) : [...f.permissions, id] }));
  }

  const grantableBase = baseRoles.filter((b) => b.id !== "owner" && b.position < (me?.position ?? 0));

  async function saveBase(reset = false) {
    if (!baseForm) return;
    const done = await call(`/api/team/base-roles/${baseForm.id}`, "PATCH", reset ? { reset: true } : { permissions: baseForm.permissions });
    if (done) setBaseForm(null);
  }

  function toggleBasePerm(id: string) {
    setBaseForm((f) => f && ({ ...f, permissions: f.permissions.includes(id) ? f.permissions.filter((p) => p !== id) : [...f.permissions, id] }));
  }

  function renderDiff(d: Diff | undefined) {
    if (!d || (!d.added?.length && !d.removed?.length)) return null;
    const name = (x: string) => permLabel.get(x) ?? x;
    return (
      <>
        {d.added?.map((x) => <span key={`a${x}`} className="tmDiff add">+ {name(x)}</span>)}
        {d.removed?.map((x) => <span key={`r${x}`} className="tmDiff rem">− {name(x)}</span>)}
      </>
    );
  }

  function renderAuditDetails(a: AuditItem) {
    const d = a.details as { changes?: Record<string, unknown>; baseRole?: string; roleNames?: string[]; roles?: string[]; permissions?: Diff; position?: number } | null;
    if (!d) return null;
    const chips: React.ReactNode[] = [];
    const ch = d.changes;
    const baseLabel = (id: unknown) => baseRoles.find((b) => b.id === id)?.label ?? String(id);
    if (ch) {
      const base = ch.baseRole as FromTo | undefined;
      if (base) chips.push(<span key="base" className="tmDiff neutral">Cargo-base: {baseLabel(base.from)} → {baseLabel(base.to)}</span>);
      const bl = ch.blocked as FromTo | undefined;
      if (bl) chips.push(<span key="bl" className={`tmDiff ${bl.to ? "rem" : "add"}`}>{bl.to ? "Bloqueado" : "Desbloqueado"}</span>);
      const rl = ch.roles as { added: string[]; removed: string[] } | undefined;
      if (rl) {
        rl.added.forEach((n) => chips.push(<span key={`ra${n}`} className="tmDiff add">+ cargo {n}</span>));
        rl.removed.forEach((n) => chips.push(<span key={`rr${n}`} className="tmDiff rem">− cargo {n}</span>));
      }
      const nm = ch.name as FromTo | undefined;
      if (nm) chips.push(<span key="nm" className="tmDiff neutral">Nome: {String(nm.from)} → {String(nm.to)}</span>);
      const ps = ch.position as FromTo | undefined;
      if (ps) chips.push(<span key="ps" className="tmDiff neutral">Posição: {String(ps.from)} → {String(ps.to)}</span>);
      if (ch.color) chips.push(<span key="cl" className="tmDiff neutral">Cor alterada</span>);
      const pd = renderDiff(ch.permissions as Diff | undefined);
      if (pd) chips.push(<span key="pd" className="tmDiffGroup">{pd}</span>);
    } else {
      if (d.baseRole) chips.push(<span key="b" className="tmDiff neutral">Cargo-base: {baseLabel(d.baseRole)}</span>);
      (d.roleNames ?? d.roles ?? []).forEach((n) => chips.push(<span key={`n${n}`} className="tmDiff add">cargo {n}</span>));
      if (typeof d.position === "number") chips.push(<span key="p" className="tmDiff neutral">Posição {d.position}</span>);
      const pd = renderDiff(d.permissions);
      if (pd) chips.push(<span key="pd" className="tmDiffGroup">{pd}</span>);
    }
    if (chips.length === 0) return <span className="helperText">Nenhuma diferença registrada.</span>;
    return <div className="tmDiffs">{chips}</div>;
  }

  if (loading && !me) return <section className="settingsPanel"><p className="helperText">Carregando equipe...</p></section>;

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Equipe</h3>
        <p className="helperText">
          Cargos com permissões marcáveis e hierarquia, como no Discord: você só gerencia quem e o que está abaixo do
          seu nível, e só concede permissões que você mesmo tem.
        </p>
      </div>

      <div className="tmTabs">
        {(["members", "roles", "audit"] as const).map((t) => (
          <button key={t} className={`tmTab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "members" ? `Membros (${members.length})` : t === "roles" ? `Cargos (${roles.length})` : "Auditoria"}
          </button>
        ))}
      </div>

      {tab === "members" && (
        <>
          <div className="tmAddRow">
            <input className="settingsInput" placeholder="Email de quem entra na equipe..." value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} />
            <select className="settingsInput" value={newMember.baseRole} onChange={(e) => setNewMember({ ...newMember, baseRole: e.target.value })}>
              {grantableBase.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
            <button className="btn" disabled={busy || !newMember.email.trim()} onClick={() => void addMember()}>Adicionar</button>
          </div>

          <div className="tmList">
            {members.map((m) => {
              const editable = canManageMember(m);
              return (
                <div key={m.id} className={`tmCard ${m.blocked ? "blocked" : ""}`}>
                  <div className="tmCardMain">
                    <strong>{m.email}{m.email === me?.email && <span className="tmYou"> (você)</span>}</strong>
                    <div className="tmChips">
                      <span className="tmChip base">{baseRoles.find((b) => b.id === m.baseRole)?.label ?? m.baseRole}</span>
                      {m.roleIds.map((id) => {
                        const r = roleById.get(id);
                        return r ? <span key={id} className="tmChip" style={{ borderColor: r.color, color: r.color }}><i style={{ background: r.color }} />{r.name}</span> : null;
                      })}
                      {m.blocked && <span className="tmChip danger">Bloqueado</span>}
                    </div>
                  </div>
                  <div className="tmActions">
                    <button className="btnSecondary" disabled={!editable || busy} onClick={() => setMemberForm({ id: m.id, email: m.email, baseRole: m.baseRole, roleIds: m.roleIds, blocked: m.blocked })}>Editar</button>
                    <button className="btnDanger" disabled={!editable || busy} onClick={() => void removeMember(m)}>Remover</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "roles" && (
        <>
          <h4 className="tmSectionTitle">Cargos padrão</h4>
          <div className="tmList">
            {baseRoles.map((b) => {
              const editable = !b.locked && b.position < (me?.position ?? 0);
              return (
                <div key={b.id} className="tmCard">
                  <div className="tmCardMain">
                    <strong>{b.label} {b.locked && <span className="tmChip base">Fixo · máximo</span>}</strong>
                    <span className="helperText">Posição {b.position} · {b.permissions.length} permissão(ões) · {members.filter((m) => m.baseRole === b.id).length} membro(s)</span>
                  </div>
                  <div className="tmActions">
                    <button className="btnSecondary" onClick={() => setBaseForm({ id: b.id, label: b.label, permissions: b.permissions })}>
                      {editable ? "Editar" : "Ver"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <h4 className="tmSectionTitle">Cargos personalizados</h4>
          <button className="btn" onClick={() => setRoleForm({ ...emptyRole, position: Math.max(1, Math.min(myTop - 1, 50)) })}>+ Novo cargo</button>
          <p className="helperText">Posição maior = mais poder. Seu nível atual: <strong>{myTop}</strong> (você cria cargos até {Math.max(0, myTop - 1)}).</p>
          <div className="tmList">
            {roles.length === 0 && <p className="emptyMsg">Nenhum cargo personalizado ainda.</p>}
            {roles.map((r) => {
              const editable = canManage(r.position);
              return (
                <div key={r.id} className="tmCard">
                  <div className="tmCardMain">
                    <strong><i className="tmDot" style={{ background: r.color }} /> {r.name}</strong>
                    <span className="helperText">Posição {r.position} · {r.permissions.length} permissão(ões) · {members.filter((m) => m.roleIds.includes(r.id)).length} membro(s)</span>
                  </div>
                  <div className="tmActions">
                    <button className="btnSecondary" disabled={!editable || busy} onClick={() => setRoleForm({ id: r.id, name: r.name, color: r.color, position: r.position, permissions: r.permissions })}>Editar</button>
                    <button className="btnDanger" disabled={!editable || busy} onClick={() => void deleteRole(r)}>Excluir</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "audit" && (
        <>
          <div className="tmList">
            {audit.length === 0 && <p className="emptyMsg">Nenhuma ação registrada ainda.</p>}
            {audit.map((a) => (
              <div key={a.id} className="tmCard">
                <div className="tmCardMain">
                  <span><strong>{a.actor_email}</strong> {ACTION_LABELS[a.action] ?? a.action} <strong>{a.target}</strong></span>
                  {renderAuditDetails(a)}
                  <span className="helperText">{new Date(a.created_at).toLocaleString("pt-BR")}</span>
                </div>
              </div>
            ))}
          </div>
          {auditTotal > 20 && (
            <div className="tmPager">
              <button className="btnSecondary" disabled={auditPage <= 1} onClick={() => void loadAudit(auditPage - 1)}>← Anterior</button>
              <span className="helperText">Página {auditPage} de {Math.ceil(auditTotal / 20)}</span>
              <button className="btnSecondary" disabled={auditPage >= Math.ceil(auditTotal / 20)} onClick={() => void loadAudit(auditPage + 1)}>Próxima →</button>
            </div>
          )}
        </>
      )}

      {roleForm && (
        <div className="modalOverlay" onClick={() => setRoleForm(null)}>
          <div className="modalContent tmModal" onClick={(e) => e.stopPropagation()}>
            <h4>{roleForm.id ? "Editar cargo" : "Novo cargo"}</h4>
            <div className="tmFormRow">
              <input className="settingsInput" placeholder="Nome do cargo" maxLength={32} value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} />
              <input type="color" className="tmColor" value={roleForm.color} onChange={(e) => setRoleForm({ ...roleForm, color: e.target.value })} />
              <input className="settingsInput tmPos" type="number" min={1} max={Math.max(1, myTop - 1)} value={roleForm.position} onChange={(e) => setRoleForm({ ...roleForm, position: Number(e.target.value) })} title="Posição na hierarquia" />
            </div>
            <div className="tmPerms">
              {groups.map(([group, perms]) => (
                <div key={group} className="tmPermGroup">
                  <span className="tmPermGroupTitle">{group}</span>
                  {perms.map((p) => {
                    const has = me?.permissions.includes(p.id) ?? false;
                    const on = roleForm.permissions.includes(p.id);
                    return (
                      <label key={p.id} className={`tmPerm ${!has && !on ? "disabled" : ""}`} title={has ? p.description : "Você não tem essa permissão, então não pode concedê-la."}>
                        <span>
                          <strong>{p.label}</strong>
                          <small>{p.description}</small>
                        </span>
                        <span className="tmSwitch">
                          <input type="checkbox" checked={on} disabled={!has && !on} onChange={() => togglePerm(p.id)} />
                          <span />
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="tmModalActions">
              <button className="btnSecondary" onClick={() => setRoleForm(null)}>Cancelar</button>
              <button className="btn" disabled={busy || roleForm.name.trim().length < 2} onClick={() => void saveRole()}>{busy ? "Salvando..." : "Salvar cargo"}</button>
            </div>
          </div>
        </div>
      )}

      {baseForm && (() => {
        const b = baseRoles.find((x) => x.id === baseForm.id);
        const readOnly = !b || b.locked || b.position >= (me?.position ?? 0);
        return (
          <div className="modalOverlay" onClick={() => setBaseForm(null)}>
            <div className="modalContent tmModal" onClick={(e) => e.stopPropagation()}>
              <h4>Cargo {baseForm.label}</h4>
              {b?.locked && <p className="helperText">O Owner é o cargo máximo: tem todas as permissões e elas não podem ser editadas.</p>}
              {!b?.locked && readOnly && <p className="helperText">Esse cargo está no seu nível ou acima, então só dá pra visualizar.</p>}
              <div className="tmPerms">
                {groups.map(([group, perms]) => (
                  <div key={group} className="tmPermGroup">
                    <span className="tmPermGroupTitle">{group}</span>
                    {perms.map((p) => {
                      const has = me?.permissions.includes(p.id) ?? false;
                      const on = baseForm.permissions.includes(p.id);
                      return (
                        <label key={p.id} className={`tmPerm ${readOnly || (!has && !on) ? "disabled" : ""}`}>
                          <span><strong>{p.label}</strong><small>{p.description}</small></span>
                          <span className="tmSwitch">
                            <input type="checkbox" checked={on || !!b?.locked} disabled={readOnly || (!has && !on)} onChange={() => toggleBasePerm(p.id)} />
                            <span />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="tmModalActions">
                <button className="btnSecondary" onClick={() => setBaseForm(null)}>{readOnly ? "Fechar" : "Cancelar"}</button>
                {!readOnly && <button className="btnSecondary" disabled={busy} onClick={() => void saveBase(true)}>Restaurar padrão</button>}
                {!readOnly && <button className="btn" disabled={busy} onClick={() => void saveBase()}>{busy ? "Salvando..." : "Salvar"}</button>}
              </div>
            </div>
          </div>
        );
      })()}

      {memberForm && (
        <div className="modalOverlay" onClick={() => setMemberForm(null)}>
          <div className="modalContent tmModal" onClick={(e) => e.stopPropagation()}>
            <h4>Editar {memberForm.email}</h4>
            <label className="tmLabel">Cargo-base
              <select className="settingsInput" value={memberForm.baseRole} onChange={(e) => setMemberForm({ ...memberForm, baseRole: e.target.value })}>
                {baseRoles.filter((b) => b.id === memberForm.baseRole || grantableBase.some((g) => g.id === b.id)).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </label>
            <span className="tmLabel">Cargos personalizados</span>
            <div className="tmRoleChecks">
              {roles.length === 0 && <p className="emptyMsg">Crie cargos na aba &quot;Cargos&quot;.</p>}
              {roles.map((r) => {
                const grantable = r.position < myTop;
                const has = memberForm.roleIds.includes(r.id);
                return (
                  <label key={r.id} className={`tmRoleCheck ${!grantable && !has ? "disabled" : ""}`}>
                    <input type="checkbox" checked={has} disabled={!grantable} onChange={() => setMemberForm({ ...memberForm, roleIds: has ? memberForm.roleIds.filter((id) => id !== r.id) : [...memberForm.roleIds, r.id] })} />
                    <i style={{ background: r.color }} /> {r.name} <small>({r.position})</small>
                  </label>
                );
              })}
            </div>
            {(() => {
              const eff = new Set<string>(baseRoles.find((b) => b.id === memberForm.baseRole)?.permissions ?? []);
              memberForm.roleIds.forEach((id) => roleById.get(id)?.permissions.forEach((p) => eff.add(p)));
              return (
                <>
                  <span className="tmLabel">Permissões atribuídas ({eff.size})</span>
                  <div className="tmEffective">
                    {eff.size === 0 && <span className="helperText">Nenhuma permissão.</span>}
                    {catalog.filter((p) => eff.has(p.id)).map((p) => <span key={p.id} className="tmChip" title={p.description}>{p.label}</span>)}
                  </div>
                </>
              );
            })()}
            <label className="tmRoleCheck">
              <input type="checkbox" checked={memberForm.blocked} onChange={(e) => setMemberForm({ ...memberForm, blocked: e.target.checked })} />
              Bloquear acesso à dashboard (mantém os cargos)
            </label>
            <div className="tmModalActions">
              <button className="btnSecondary" onClick={() => setMemberForm(null)}>Cancelar</button>
              <button className="btn" disabled={busy} onClick={() => void saveMember()}>{busy ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
