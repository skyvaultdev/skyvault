"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import  "./add.css"

type Categoria = {
  id_categoria: number;
  nome_categoria: string;
};

export default function createProduct() {
  // (1) Estado do usuário pra decidir o link do ícone
  const [userLinkHref, setUserLinkHref] = useState("/login");

  // (2) Estados do formulário
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [idCategoria, setIdCategoria] = useState<string>("");
  const [prazoEntrega, setPrazoEntrega] = useState<string>("");

  // (3) Estados de categorias
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [catLoading, setCatLoading] = useState(true);

  // (4) Upload / preview
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("/assets/default.png");

  // (5) Evita re-criar array de prazos toda hora
  const prazos = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => i + 1);
  }, []);

  // (6) No client: decide o link do usuário e pega categorias
  useEffect(() => {
    // 6.1) Decide o link do user
    const userRaw = localStorage.getItem("user");
    const user = userRaw ? JSON.parse(userRaw) : null;
    setUserLinkHref(user ? "/perfil" : "/login");

    // 6.2) Busca categorias no backend Express
    const loadCats = async () => {
      try {
        setCatLoading(true);
        const res = await fetch("http://localhost:3000/categorias", {
          method: "GET",
          credentials: "include",
        });

        const data = await res.json();
        setCategorias(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erro ao carregar categorias:", err);
        setCategorias([]);
      } finally {
        setCatLoading(false);
      }
    };

    loadCats();
  }, []);

  // (7) Quando muda o arquivo, cria preview e limpa quando trocar
  useEffect(() => {
    if (!file) {
      setPreviewUrl("/assets/default.png");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // (8) Handler do submit
  async function handleCreate() {
    // 8.1) Pega id_prestador do localStorage (igual seu HTML)
    const idPrestadorRaw = localStorage.getItem("id_prestador");
    const idPrestador = idPrestadorRaw ? Number(idPrestadorRaw) : NaN;

    // 8.2) Converte e valida campos
    const precoNum = Number(preco);
    const idCategoriaNum = Number(idCategoria);
    const prazoEntregaNum = Number(prazoEntrega);

    if (
      !nome.trim() ||
      !descricao.trim() ||
      !Number.isFinite(precoNum) ||
      precoNum <= 0 ||
      !Number.isFinite(idCategoriaNum) ||
      !Number.isFinite(idPrestador) ||
      !Number.isFinite(prazoEntregaNum)
    ) {
      alert("Preencha todos os campos e esteja logado como prestador.");
      return;
    }

    // 8.3) Monta FormData (multipart)
    const formData = new FormData();
    formData.append("nome", nome.trim());
    formData.append("preco", String(precoNum));
    formData.append("descricao", descricao.trim());
    formData.append("id_categoria", String(idCategoriaNum));
    formData.append("id_prestador", String(idPrestador));
    formData.append("prazo_entrega", String(prazoEntregaNum));

    if (file) {
      formData.append("imagem", file);
    }

    // 8.4) Envia pro backend
    try {
      const res = await fetch("http://localhost:3000/servicos", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        alert("Serviço cadastrado com sucesso!");
        window.location.href = "/editar-servico";
      } else {
        alert("Erro ao cadastrar serviço: " + (data?.message || "Erro"));
      }
    } catch (err) {
      console.error("Erro ao cadastrar serviço:", err);
      alert("Erro ao cadastrar serviço");
    }
  }

  return (
    <div>
      {/* HEADER */}
      <header className="header">
        <div className="nav-container">
          <div className="nav-left">
            <Link href="/">
              {/* Troque pelo seu logo em /public/assets/... */}
              <img
                src="/assets/logotipo sem fundo.png"
                alt="Logotipo Portal Conecta Contatos"
                className="logo"
              />
            </Link>
          </div>

          <div className="nav-center">
            <input
              type="text"
              name="buscar"
              placeholder="Buscar serviços..."
              className="search"
            />
          </div>

          <div className="nav-right">
            <Link href={userLinkHref} id="user-link" aria-label="Usuário">
              <i className="fas fa-user" />
            </Link>
            <Link href="/chat" aria-label="Chat">
              <i className="fas fa-message" />
            </Link>
            <Link href="/config" aria-label="Configurações">
              <i className="fas fa-gear" />
            </Link>
          </div>
        </div>
      </header>

      <div className="nav-midleft">
        <h1>PCC</h1>
        <p>Portal Conecta Contatos</p>
      </div>

      <main>
        <div className="servicos-lista"></div>
      </main>

      <div className="transparency-box"></div>

      {/* FORM */}
      <div className="criar-container">
        <p>Criar serviço</p>

        <div className="info-servicos">
          <label htmlFor="titulo-servico">Título do serviço</label>
          <input
            type="text"
            id="titulo-servico"
            placeholder="Gravo comercial para você"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />

          <br />

          <label htmlFor="preco-servico">Preço (R$)</label>
          <input
            type="number"
            id="preco-servico"
            step="0.01"
            min={10}
            max={2000}
            placeholder="valor(R$)"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            required
          />

          <label htmlFor="categoria-servico">Categoria</label>
          <select
            id="categoria-servico"
            value={idCategoria}
            onChange={(e) => setIdCategoria(e.target.value)}
            required
            disabled={catLoading}
          >
            <option value="">Selecione a categoria</option>
            {categorias.map((cat) => (
              <option key={cat.id_categoria} value={String(cat.id_categoria)}>
                {cat.nome_categoria}
              </option>
            ))}
          </select>

          <br />

          <div className="descricao-servico">
            <label htmlFor="descricao-servico">Descrição</label>
            <textarea
              id="descricao-servico"
              placeholder="Descreva seu serviço"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <label htmlFor="data-servico">Data de entrega</label>
          <select
            id="data-servico"
            value={prazoEntrega}
            onChange={(e) => setPrazoEntrega(e.target.value)}
            required
          >
            <option value="">Data de entrega</option>
            {prazos.map((d) => (
              <option key={d} value={String(d)}>
                {d} dia{d > 1 ? "s" : ""}
              </option>
            ))}
          </select>

          <br />

          <label htmlFor="imagem-servico">Imagem de preview</label>
          <div className="image-preview-box">
            {/* se quiser usar next/image, precisa configurar domains ou usar <img> */}
            <img id="preview-img" src={previewUrl} alt="Preview do serviço" />
          </div>

          <input
            type="file"
            id="file-input"
            accept="image/*"
            required
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
            }}
          />
        </div>

        <div className="botaocriar">
          <button type="button" id="btn-criar-servico" onClick={handleCreate}>
            Criar serviço
          </button>
        </div>
      </div>
    </div>
  );
}
