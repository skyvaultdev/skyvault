"use client";

import { useEffect } from "react";


type StoreSettingsRaw = any;

export default function StoreThemeLoader() {
  useEffect(() => {
    let cancelled = false;

    async function loadTheme() {
      try {
        var response = await fetch("/api/store-settings", { cache: "no-store" });
        if (!response.ok) return;

        //  pega o json cru
        var raw = (await response.json()) as StoreSettingsRaw;
        // se seu ok() estiver embrulhando, tenta pegar raw.data também
        var data = raw?.data ?? raw;

        if (cancelled) return;

        //normaliza camelCase OU snake_case
        var primaryColor = data.primaryColor ?? data.primary_color ?? "#b700ff";
        var secondaryColor = data.secondaryColor ?? data.secondary_color ?? "#6400ff";

        var backgroundType =
          data.backgroundType ?? data.background_style ?? "lines";

        var backgroundImageUrl =
          data.backgroundImageUrl ?? data.background_img_url ?? null;

        var backgroundCss =
          data.backgroundCss ?? data.background_css ?? null;

        // 4) aplica global
        var root = document.documentElement;
        var body = document.body;

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
        var previousTag = document.getElementById(tagId);
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