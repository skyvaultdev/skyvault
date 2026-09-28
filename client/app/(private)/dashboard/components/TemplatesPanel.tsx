"use client";

import { useEffect, useState } from "react";
import "./TemplatesPanel.css";
import { useModal } from "@/app/(components)/modal/ModalProvider";
import Icon, { type IconName } from "@/components/icons/Icon";
import { SECTION_DEFS, TEMPLATES, defOf, newSection, type FieldDef, type HomeConfig, type HomeSection } from "@/lib/home/config";

type ProductOpt = { id: number; name: string };

export default function TemplatesPanel() {
  const modal = useModal();
  const [config, setConfig] = useState<HomeConfig | null>(null);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addType, setAddType] = useState(SECTION_DEFS[0].type);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [cfgRes, prodRes] = await Promise.all([
        fetch("/api/admin/home-config", { cache: "no-store" }),
        fetch("/api/products", { cache: "no-store" }),
      ]);
      const cfg = await cfgRes.json();
      const prod = await prodRes.json();
      if (cfgRes.ok && cfg.data) setConfig(cfg.data);
      if (prodRes.ok && Array.isArray(prod.data)) setProducts(prod.data.map((p: ProductOpt) => ({ id: Number(p.id), name: p.name })));
    })();
  }, []);

  function update(next: HomeConfig) {
    setConfig(next);
    setDirty(true);
  }

  function patchSection(id: string, fn: (s: HomeSection) => HomeSection) {
    if (!config) return;
    update({ ...config, template: config.template, sections: config.sections.map((s) => (s.id === id ? fn(s) : s)) });
  }

  function move(id: string, dir: -1 | 1) {
    if (!config) return;
    const i = config.sections.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= config.sections.length) return;
    const list = [...config.sections];
    [list[i], list[j]] = [list[j], list[i]];
    update({ ...config, sections: list });
  }

  function dropOn(targetId: string) {
    if (!config || !dragId || dragId === targetId) return;
    const list = [...config.sections];
    const from = list.findIndex((x) => x.id === dragId);
    const to = list.findIndex((x) => x.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    update({ ...config, sections: list });
  }

  async function uploadMedia(section: HomeSection, listKey: string, items: Record<string, string>[], idx: number) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(`${section.id}-${idx}`);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/home-media", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          await modal.alert(json.error === "FILE_TOO_LARGE" ? "Arquivo grande demais (imagem até 5 MB, vídeo até 30 MB)." : "Não foi possível enviar o arquivo. Use JPG, PNG, WEBP, GIF, MP4 ou WEBM.");
          return;
        }
        setField(section, listKey, items.map((x, k) => (k === idx ? { ...x, mediaUrl: json.data.url, kind: json.data.kind } : x)));
      } finally {
        setUploading(null);
      }
    };
    input.click();
  }

  async function restoreTemplate() {
    if (!config) return;
    const t = TEMPLATES.find((x) => x.id === config.template);
    if (!t) return;
    if (!(await modal.confirm(`Restaurar o padrão do template "${t.name}"? Suas edições nas seções serão descartadas (você ainda precisa salvar).`, { danger: true }))) return;
    update(t.build());
    setOpenId(null);
  }

  function remove(id: string) {
    if (!config) return;
    update({ ...config, sections: config.sections.filter((s) => s.id !== id) });
  }

  function add() {
    if (!config) return;
    const s = newSection(addType);
    if (!s) return;
    update({ ...config, sections: [...config.sections, s] });
    setOpenId(s.id);
  }

  async function applyTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    if (!(await modal.confirm(`Aplicar o template "${t.name}"? Isso substitui a organização atual da home (você ainda precisa salvar).`))) return;
    update(t.build());
    setOpenId(null);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/home-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!res.ok) {
        await modal.alert("Não foi possível salvar a home.");
        return;
      }
      setConfig(json.data);
      setDirty(false);
      await modal.alert("Home salva! Já está valendo na loja.");
    } finally {
      setSaving(false);
    }
  }

  function setField(section: HomeSection, key: string, value: unknown) {
    patchSection(section.id, (s) => ({ ...s, data: { ...s.data, [key]: value } }));
  }

  function renderField(section: HomeSection, f: FieldDef) {
    const value = section.data[f.key];
    if (f.type === "textarea") {
      return <textarea className="tpInput" rows={3} maxLength={1000} value={String(value ?? "")} onChange={(e) => setField(section, f.key, e.target.value)} />;
    }
    if (f.type === "select") {
      return (
        <select className="tpInput" value={String(value ?? "")} onChange={(e) => setField(section, f.key, e.target.value)}>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (f.type === "product") {
      return (
        <select className="tpInput" value={Number(value) || 0} onChange={(e) => setField(section, f.key, Number(e.target.value))}>
          <option value={0}>Selecionar produto...</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      );
    }
    if (f.type === "number") {
      return <input className="tpInput" type="number" min={f.min} max={f.max} value={Number(value) || 0} onChange={(e) => setField(section, f.key, Number(e.target.value))} />;
    }
    return <input className="tpInput" type="text" placeholder={f.placeholder} maxLength={f.type === "url" ? 500 : 200} value={String(value ?? "")} onChange={(e) => setField(section, f.key, e.target.value)} />;
  }

  if (!config) return <section className="settingsPanel"><p className="helperText">Carregando...</p></section>;

  return (
    <section className="settingsPanel">
      <div className="tabHeader">
        <h3>Templates da home</h3>
        <p className="helperText">
          Escolha um modelo e depois monte a home do seu jeito: ligue/desligue seções, mude a ordem e edite os textos.
          As cores continuam as da sua loja.
        </p>
      </div>

      <div className="tpTemplates">
        {TEMPLATES.map((t) => (
          <button key={t.id} className={`tpTemplate ${config.template === t.id ? "active" : ""}`} onClick={() => void applyTemplate(t.id)}>
            <strong>{t.name}</strong>
            <span>{t.description}</span>
            {config.template === t.id && <em>Em uso</em>}
          </button>
        ))}
      </div>

      <div className="tpBar">
        <span className="helperText">{config.sections.length} seção(ões){config.template === "custom" ? " · personalizada" : ""}</span>
        <div className="tpBarActions">
          {TEMPLATES.some((t) => t.id === config.template) && (
            <button className="btnSecondary" onClick={() => void restoreTemplate()} title="Volta as seções e textos ao modelo original">
              <Icon name="refresh" /> Restaurar padrão do template
            </button>
          )}
          <a className="btnSecondary tpLink" href="/" target="_blank" rel="noopener noreferrer">Ver home</a>
          <button className="btn" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Salvando..." : dirty ? "Salvar home" : "Salvo"}</button>
        </div>
      </div>

      <div className="tpList">
        {config.sections.map((s, i) => {
          const def = defOf(s.type);
          if (!def) return null;
          const open = openId === s.id;
          return (
            <div
              key={s.id}
              className={`tpItem ${s.enabled ? "" : "off"} ${dragId === s.id ? "dragging" : ""} ${overId === s.id && dragId !== s.id ? "over" : ""}`}
              draggable={armedId === s.id}
              onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.id); }}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(s.id); } }}
              onDrop={(e) => { e.preventDefault(); dropOn(s.id); setDragId(null); setOverId(null); setArmedId(null); }}
              onDragEnd={() => { setDragId(null); setOverId(null); setArmedId(null); }}
            >
              <div className="tpItemHead">
                <span
                  className="tpGrip"
                  title="Segure e arraste para reordenar"
                  onPointerDown={() => setArmedId(s.id)}
                  onPointerUp={() => setArmedId(null)}
                  onPointerCancel={() => setArmedId(null)}
                >
                  <Icon name="grip" />
                </span>
                <span className="tpIcon"><Icon name={def.icon as IconName} size="1.3em" /></span>
                <div className="tpItemTitle" onClick={() => setOpenId(open ? null : s.id)}>
                  <strong>{def.label}</strong>
                  <span>{def.description}</span>
                </div>
                <div className="tpItemActions">
                  <button title="Subir" disabled={i === 0} onClick={() => move(s.id, -1)}><Icon name="arrowUp" /></button>
                  <button title="Descer" disabled={i === config.sections.length - 1} onClick={() => move(s.id, 1)}><Icon name="arrowDown" /></button>
                  <label className="tpSwitch" title={s.enabled ? "Visível" : "Oculta"}>
                    <input type="checkbox" checked={s.enabled} onChange={(e) => patchSection(s.id, (x) => ({ ...x, enabled: e.target.checked }))} />
                    <span />
                  </label>
                  {(def.fields.length > 0 || def.lists) && <button onClick={() => setOpenId(open ? null : s.id)}>{open ? "Fechar" : "Editar"}</button>}
                  <button className="danger" title="Remover" onClick={() => remove(s.id)}><Icon name="x" /></button>
                </div>
              </div>

              {open && (
                <div className="tpFields">
                  {def.fields.map((f) => (
                    <label key={f.key} className="tpField">
                      <span>{f.label}</span>
                      {renderField(s, f)}
                    </label>
                  ))}
                  {def.lists?.map((l) => {
                    const items = (s.data[l.key] as Record<string, string>[]) ?? [];
                    return (
                      <div key={l.key} className="tpListEditor">
                        <span className="tpListTitle">{l.label} ({items.length}/{l.max})</span>
                        {items.map((it, idx) => (
                          <div key={idx} className="tpListRow">
                            {l.fields.map((f) => (
                              f.type === "media" ? (
                                <div key={f.key} className="tpMedia">
                                  {it[f.key] && (it.kind === "video"
                                    ? <video src={it[f.key]} muted className="tpMediaThumb" />
                                    : <img src={it[f.key]} alt="" className="tpMediaThumb" />)}
                                  <button type="button" className="btnSecondary" disabled={uploading === `${s.id}-${idx}`} onClick={() => void uploadMedia(s, l.key, items, idx)}>
                                    <Icon name="upload" /> {uploading === `${s.id}-${idx}` ? "Enviando..." : it[f.key] ? "Trocar arquivo" : "Enviar imagem/vídeo"}
                                  </button>
                                </div>
                              ) : f.type === "select" ? (
                                <select key={f.key} className="tpInput" value={it[f.key] ?? f.options?.[0]?.value ?? ""} onChange={(e) => setField(s, l.key, items.map((x, k) => (k === idx ? { ...x, [f.key]: e.target.value } : x)))}>
                                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              ) : f.type === "textarea"
                                ? <textarea key={f.key} className="tpInput" rows={2} placeholder={f.label} value={it[f.key] ?? ""} onChange={(e) => setField(s, l.key, items.map((x, k) => (k === idx ? { ...x, [f.key]: e.target.value } : x)))} />
                                : <input key={f.key} className="tpInput" placeholder={f.placeholder ?? f.label} value={it[f.key] ?? ""} onChange={(e) => setField(s, l.key, items.map((x, k) => (k === idx ? { ...x, [f.key]: e.target.value } : x)))} />
                            ))}
                            <button className="danger" onClick={() => setField(s, l.key, items.filter((_, k) => k !== idx))}><Icon name="x" /></button>
                          </div>
                        ))}
                        {items.length < l.max && (
                          <button className="btnSecondary" onClick={() => setField(s, l.key, [...items, Object.fromEntries(l.fields.map((f) => [f.key, ""]))])}>+ Adicionar</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="tpAdd">
        <select className="tpInput" value={addType} onChange={(e) => setAddType(e.target.value)}>
          {SECTION_DEFS.map((d) => <option key={d.type} value={d.type}>{d.label}</option>)}
        </select>
        <button className="btnSecondary" onClick={add}>+ Adicionar seção</button>
      </div>
    </section>
  );
}
