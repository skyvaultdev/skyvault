"use client";

import { useEffect } from "react";


type StoreSettingsRaw = any;

export default function StoreThemeLoader() {
  useEffect(() => {
    let cancelled = false;

    async function loadTheme() {
      try {
        const response = await fetch("/api/store-settings", { cache: "no-store" });
        if (!response.ok) return;

        // 1) pega o json cru
        const raw = (await response.json()) as StoreSettingsRaw;

        // 2) se seu ok() estiver embrulhando, tenta pegar raw.data também
        const data = raw?.data ?? raw;

        if (cancelled) return;

        // 3) normaliza camelCase OU snake_case
        const primaryColor = data.primaryColor ?? data.primary_color ?? "#b700ff";
        const secondaryColor = data.secondaryColor ?? data.secondary_color ?? "#6400ff";

        const backgroundType =
          data.backgroundType ?? data.background_style ?? "lines";

        const backgroundImageUrl =
          data.backgroundImageUrl ?? data.background_img_url ?? null;

        const backgroundCss =
          data.backgroundCss ?? data.background_css ?? null;

        // 4) aplica global
        const root = document.documentElement;
        const body = document.body;

        root.style.setProperty("--primary", primaryColor);
        root.style.setProperty("--secondary", secondaryColor);

        body.dataset.storeBackground = backgroundType;

        if (backgroundImageUrl) {
          body.style.backgroundImage = `url(${backgroundImageUrl})`;
          body.style.backgroundSize = "cover";
          body.style.backgroundPosition = "center";
        } else {
          body.style.backgroundImage = "";
          body.style.backgroundSize = "";
          body.style.backgroundPosition = "";
        }

        // 5) injeta css custom
        const tagId = "store-custom-background";
        const previousTag = document.getElementById(tagId);
        if (previousTag) previousTag.remove();

        if (backgroundCss) {
          const styleTag = document.createElement("style");
          styleTag.id = tagId;
          styleTag.innerHTML = `body { ${backgroundCss} }`;
          document.head.appendChild(styleTag);
        }
      } catch {}
    }

    loadTheme();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}