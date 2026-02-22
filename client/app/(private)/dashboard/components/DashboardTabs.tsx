"use client";

import { useMemo } from "react";
import type { DashboardTab } from "./Sidebar";
import "./components.css";

type ProductItem = {
  id: number;
  name: string;
  position?: number | null;
};

type AdminItem = {
  id: number;
  email: string;
};

type StoreSettings = {
  primaryColor: string;
  secondaryColor: string;
  backgroundType: "lines" | "dots";
  backgroundCss: string;
  backgroundImageUrl: string;
};

type DashboardTabsProps = {
  selectedTab: DashboardTab;
  previewProducts: ProductItem[];
  colorTarget: "primary" | "secondary";
  selectedColor: string;
  onChangeColorTarget: (target: "primary" | "secondary") => void;
  onChangeSelectedColor: (value: string) => void;
  onSaveColors: () => Promise<void>;
  storeSettings: StoreSettings;
  onBackgroundTypeChange: (type: "lines" | "dots") => void;
  onBackgroundCssChange: (css: string) => void;
  onBackgroundImageChange: (file: File | null) => void;
  onSaveBackground: () => Promise<void>;
  orderedProducts: ProductItem[];
  onDragStart: (id: number) => void;
  onDrop: (id: number) => void;
  onSavePositions: () => Promise<void>;
  admins: AdminItem[];
};

export default function DashboardTabs(props: DashboardTabsProps) {
  const {
    selectedTab,
    previewProducts,
    colorTarget,
    selectedColor,
    onChangeColorTarget,
    onChangeSelectedColor,
    onSaveColors,
    storeSettings,
    onBackgroundTypeChange,
    onBackgroundCssChange,
    onBackgroundImageChange,
    onSaveBackground,
    orderedProducts,
    onDragStart,
    onDrop,
    onSavePositions,
    admins,
  } = props;

  const previewCards = useMemo(() => previewProducts.slice(0, 4), [previewProducts]);

  if (selectedTab === "inicio") {
    return (
      <section className="settingsPanel">
        <h3>Prévia da Home</h3>
        <div className="previewBanner">Banner principal da loja</div>
        <div className="previewGrid">
          {previewCards.map((product) => (
            <article key={product.id} className="previewCard">
              <strong>{product.name}</strong>
              <span>ID: {product.id}</span>
            </article>
          ))}
          {previewCards.length === 0 && <p>Nenhum produto disponível para prévia.</p>}
        </div>
      </section>
    );
  }

  if (selectedTab === "cores") {
    return (
      <section className="settingsPanel">
        <h3>Cores da loja</h3>

        <label className="fieldLabel" htmlFor="color-target">Grupo de cor</label>
        <select
          id="color-target"
          value={colorTarget ?? "primary"}
          onChange={(event) => onChangeColorTarget(event.target.value as "primary" | "secondary")}
          className="settingsInput"
        >
          <option value="primary">Primária</option>
          <option value="secondary">Secundária</option>
        </select>

        <label className="fieldLabel" htmlFor="color-picker">Selecionar cor</label>
        <input
          id="color-picker"
          type="color"
          value={selectedColor ?? "#b700ff"}
          onChange={(event) => onChangeSelectedColor(event.target.value)}
          className="colorPicker"
          aria-label="Selecionar cor da loja"
        />

        <button className="btn" type="button" onClick={() => void onSaveColors()} aria-label="Salvar cores da loja">
          Salvar cores
        </button>

        <p className="helperText">
          Primária: {storeSettings.primaryColor ?? "#b700ff"} | Secundária: {storeSettings.secondaryColor ?? "#6400ff"}
        </p>
      </section>
    );
  }

  if (selectedTab === "background") {
    return (
      <section className="settingsPanel">
        <h3>Background</h3>

        <label className="radioRow">
          <input
            type="radio"
            checked={(storeSettings.backgroundType ?? "lines") === "lines"}
            onChange={() => onBackgroundTypeChange("lines")}
          />
          Linhas
        </label>

        <label className="radioRow">
          <input
            type="radio"
            checked={(storeSettings.backgroundType ?? "lines") === "dots"}
            onChange={() => onBackgroundTypeChange("dots")}
          />
          Pontos
        </label>

        <label className="fieldLabel" htmlFor="background-image">Upload de imagem</label>
        <input
          id="background-image"
          type="file"
          accept="image/*"
          onChange={(event) => onBackgroundImageChange(event.target.files?.[0] ?? null)}
          className="settingsInput"
        />

        <label className="fieldLabel" htmlFor="background-css">CSS customizado</label>
        <textarea
          id="background-css"
          value={storeSettings.backgroundCss ?? ""}
          onChange={(event) => onBackgroundCssChange(event.target.value)}
          className="settingsTextarea"
          rows={4}
        />

        <button className="btn" type="button" onClick={() => void onSaveBackground()} aria-label="Salvar background da loja">
          Salvar background
        </button>
      </section>
    );
  }

  if (selectedTab === "posicao") {
    return (
      <section className="settingsPanel">
        <h3>Posição dos produtos</h3>
        <div className="sortableList">
          {orderedProducts.map((product) => (
            <div
              key={product.id}
              draggable
              onDragStart={() => onDragStart(product.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(product.id)}
              className="sortableItem"
            >
              {product.name}
            </div>
          ))}
        </div>
        <button className="btn" type="button" onClick={() => void onSavePositions()} aria-label="Salvar ordem dos produtos">
          Salvar ordem
        </button>
      </section>
    );
  }

  return (
    <section className="settingsPanel">
      <h3>Equipe</h3>
      <button type="button" className="addbtn">Adicionar Equipe</button>
      <button type="button" className="removebtn">Remover Equipe</button>
      <table className="teamTable">
        <thead>
          <tr>
            <th>ID</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {admins.map((admin) => (
            <tr key={admin.id}>
              <td>{admin.id}</td>
              <td>{admin.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {admins.length === 0 && <p>Nenhum admin encontrado.</p>}
    </section>
  );
}