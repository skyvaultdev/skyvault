// Configuração da home por seções — módulo puro (sem banco), usado tanto
// pela home (servidor), pela API de salvar (validação) quanto pela aba de
// templates da dashboard (formulários gerados a partir daqui).

export type FieldType = "text" | "textarea" | "url" | "number" | "product" | "select" | "media";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
};

export type ListDef = { key: string; label: string; max: number; fields: FieldDef[] };

export type SectionDef = {
  type: string;
  label: string;
  description: string;
  // nome do ícone em components/icons/Icon.tsx
  icon: string;
  fields: FieldDef[];
  lists?: ListDef[];
  defaults: Record<string, unknown>;
};

export const SECTION_DEFS: SectionDef[] = [
  {
    type: "announcement", label: "Barra de aviso", icon: "megaphone",
    description: "Faixa fina no topo da home (promoções, novidades).",
    fields: [
      { key: "text", label: "Texto", type: "text", placeholder: "Frete grátis acima de R$ 150" },
      { key: "link", label: "Link (opcional)", type: "url", placeholder: "/catalog" },
    ],
    defaults: { text: "Novidades toda semana na loja!", link: "" },
  },
  {
    type: "hero", label: "Banner principal", icon: "image",
    description: "Bloco grande de abertura com título, texto e botão.",
    fields: [
      { key: "badge", label: "Selo (opcional)", type: "text", placeholder: "NOVIDADE" },
      { key: "title", label: "Título", type: "text", placeholder: "Título de impacto" },
      { key: "subtitle", label: "Subtítulo", type: "textarea" },
      { key: "buttonText", label: "Texto do botão", type: "text", placeholder: "Ver produtos" },
      { key: "buttonLink", label: "Link do botão", type: "url", placeholder: "/catalog" },
      { key: "imageUrl", label: "Imagem de fundo (URL, opcional)", type: "url" },
      { key: "align", label: "Alinhamento", type: "select", options: [{ value: "center", label: "Centro" }, { value: "left", label: "Esquerda" }] },
    ],
    defaults: { badge: "", title: "Bem-vindo à nossa loja", subtitle: "Entrega automática e suporte rápido.", buttonText: "Ver produtos", buttonLink: "/catalog", imageUrl: "", align: "center" },
  },
  {
    type: "banners", label: "Banners da loja", icon: "film",
    description: "Faixa de banners com imagem ou vídeo de apresentação, título, texto e link.",
    fields: [],
    lists: [{ key: "slides", label: "Banners", max: 8, fields: [
      { key: "kind", label: "Tipo", type: "select", options: [{ value: "image", label: "Imagem" }, { value: "video", label: "Vídeo (mudo, em loop)" }] },
      { key: "mediaUrl", label: "Arquivo", type: "media" },
      { key: "title", label: "Título", type: "text" },
      { key: "subtitle", label: "Texto de apoio", type: "text" },
      { key: "link", label: "Link (opcional)", type: "url", placeholder: "/catalog" },
    ] }],
    defaults: { slides: [] },
  },
  {
    type: "stats", label: "Números de confiança", icon: "chart",
    description: "Faixa com até 4 indicadores (usuários, avaliação, suporte...).",
    fields: [],
    lists: [{ key: "items", label: "Indicadores", max: 4, fields: [
      { key: "value", label: "Valor", type: "text", placeholder: "15K+" },
      { key: "label", label: "Descrição", type: "text", placeholder: "Usuários ativos" },
    ] }],
    defaults: { items: [{ value: "15K+", label: "Clientes" }, { value: "100%", label: "Confiança" }, { value: "24/7", label: "Suporte" }] },
  },
  {
    type: "spotlight", label: "Produto em destaque", icon: "fire",
    description: "Vitrine de um produto com preço, cupom e botão de compra.",
    fields: [
      { key: "productId", label: "Produto", type: "product" },
      { key: "badge", label: "Selo", type: "text", placeholder: "LANÇAMENTO" },
      { key: "title", label: "Título (vazio = nome do produto)", type: "text" },
      { key: "subtitle", label: "Texto de apoio", type: "textarea" },
      { key: "couponCode", label: "Cupom (opcional)", type: "text", placeholder: "PROMO15" },
      { key: "couponText", label: "Texto do cupom", type: "text", placeholder: "para 15% de desconto" },
      { key: "buttonText", label: "Texto do botão", type: "text", placeholder: "Comprar agora" },
    ],
    defaults: { productId: 0, badge: "DESTAQUE", title: "", subtitle: "", couponCode: "", couponText: "", buttonText: "Comprar agora" },
  },
  {
    type: "categories", label: "Categorias", icon: "folder",
    description: "Atalhos para as categorias da loja.",
    fields: [
      { key: "title", label: "Título", type: "text", placeholder: "Categorias" },
      { key: "style", label: "Estilo", type: "select", options: [{ value: "grid", label: "Cartões" }, { value: "select", label: "Seletor (atual)" }] },
    ],
    defaults: { title: "Categorias", style: "grid" },
  },
  {
    type: "highlights", label: "Destaques da loja", icon: "star",
    description: "Carrossel dos primeiros produtos da vitrine.",
    fields: [], defaults: {},
  },
  {
    type: "catalog", label: "Produtos por categoria", icon: "bag",
    description: "Seções de produtos agrupadas por categoria.",
    fields: [{ key: "perCategory", label: "Produtos por categoria", type: "number", min: 2, max: 12 }],
    defaults: { perCategory: 6 },
  },
  {
    type: "faq", label: "Perguntas frequentes", icon: "help",
    description: "Lista de perguntas e respostas (abre e fecha).",
    fields: [{ key: "title", label: "Título", type: "text", placeholder: "Perguntas frequentes" }],
    lists: [{ key: "items", label: "Perguntas", max: 8, fields: [
      { key: "q", label: "Pergunta", type: "text" },
      { key: "a", label: "Resposta", type: "textarea" },
    ] }],
    defaults: { title: "Perguntas frequentes", items: [{ q: "Como recebo meu produto?", a: "A entrega é automática depois da confirmação do pagamento." }] },
  },
  {
    type: "social", label: "Comunidade / redes", icon: "chat",
    description: "Links de Discord, YouTube, Instagram e WhatsApp.",
    fields: [
      { key: "title", label: "Título", type: "text", placeholder: "Comunidade" },
      { key: "discord", label: "Discord", type: "url" },
      { key: "youtube", label: "YouTube", type: "url" },
      { key: "instagram", label: "Instagram", type: "url" },
      { key: "whatsapp", label: "WhatsApp", type: "url" },
    ],
    defaults: { title: "Entre na nossa comunidade", discord: "", youtube: "", instagram: "", whatsapp: "" },
  },
];

export type HomeSection = { id: string; type: string; enabled: boolean; data: Record<string, unknown> };
export type HomeConfig = { template: string; sections: HomeSection[] };

export function defOf(type: string): SectionDef | undefined {
  return SECTION_DEFS.find((d) => d.type === type);
}

function mk(type: string, overrides: Record<string, unknown> = {}, enabled = true): HomeSection {
  const def = defOf(type)!;
  return { id: `${type}-${Math.random().toString(36).slice(2, 8)}`, type, enabled, data: { ...JSON.parse(JSON.stringify(def.defaults)), ...overrides } };
}

export function newSection(type: string): HomeSection | null {
  return defOf(type) ? mk(type) : null;
}

export const TEMPLATES: { id: string; name: string; description: string; build: () => HomeConfig }[] = [
  {
    id: "classic", name: "Clássico", description: "A home atual: banners, seletor de categoria, destaques e produtos por categoria.",
    build: () => ({ template: "classic", sections: [mk("banners"), mk("categories", { title: "", style: "select" }), mk("highlights"), mk("catalog")] }),
  },
  {
    id: "showcase", name: "Vitrine", description: "Aviso, banner grande, números de confiança, produto em destaque, categorias, FAQ e comunidade.",
    build: () => ({
      template: "showcase",
      sections: [mk("announcement"), mk("hero", { badge: "DESTAQUE DA SEMANA", align: "left" }), mk("stats"), mk("spotlight"), mk("categories"), mk("highlights"), mk("catalog"), mk("faq"), mk("social")],
    }),
  },
  {
    id: "minimal", name: "Minimalista", description: "Banner simples, produtos por categoria e links de contato.",
    build: () => ({ template: "minimal", sections: [mk("hero", { title: "Nossa loja", subtitle: "", buttonText: "Ver produtos" }), mk("catalog"), mk("social")] }),
  },
];

export const DEFAULT_CONFIG: HomeConfig = TEMPLATES[0].build();

const SAFE_URL = /^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+)$/i;

function str(v: unknown, max: number) {
  return String(v ?? "").trim().slice(0, max);
}

function cleanField(f: FieldDef, v: unknown): unknown {
  switch (f.type) {
    case "text": return str(v, 200);
    case "textarea": return str(v, 1000);
    case "url": { const s = str(v, 500); return s === "" || SAFE_URL.test(s) ? s : ""; }
    case "number": { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(f.max ?? 100, Math.max(f.min ?? 0, n)) : (f.min ?? 0); }
    case "product": { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; }
    case "media": { const s = str(v, 500); return s === "" || SAFE_URL.test(s) ? s : ""; }
    case "select": return f.options?.some((o) => o.value === v) ? String(v) : f.options?.[0]?.value ?? "";
  }
}

// Valida/normaliza o que veio do cliente: só tipos conhecidos, só campos
// declarados, strings limitadas e URLs só relativas ou http(s) — nunca
// javascript: nem HTML solto (a home renderiza como texto).
export function sanitizeConfig(input: unknown): HomeConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as { template?: unknown; sections?: unknown };
  if (!Array.isArray(raw.sections) || raw.sections.length > 20) return null;

  const sections: HomeSection[] = [];
  for (const s of raw.sections as Record<string, unknown>[]) {
    const def = defOf(String(s?.type));
    if (!def) continue;
    const data = (s.data ?? {}) as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const f of def.fields) clean[f.key] = cleanField(f, data[f.key]);
    for (const l of def.lists ?? []) {
      const arr = Array.isArray(data[l.key]) ? (data[l.key] as Record<string, unknown>[]).slice(0, l.max) : [];
      clean[l.key] = arr.map((it) => Object.fromEntries(l.fields.map((f) => [f.key, cleanField(f, it?.[f.key])])));
    }
    sections.push({
      id: str(s.id, 40).replace(/[^a-zA-Z0-9_-]/g, "") || `${def.type}-${sections.length}`,
      type: def.type,
      enabled: s.enabled !== false,
      data: clean,
    });
  }
  return { template: str(raw.template, 30) || "custom", sections };
}
