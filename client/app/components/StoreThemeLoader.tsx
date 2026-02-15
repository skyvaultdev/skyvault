"use client";

import { useEffect } from "react";

type StoreSettings = {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundType?: "lines" | "dots";
  backgroundImageUrl?: string | null;
  backgroundCss?: string | null;
};

export default function StoreThemeLoader() {
  useEffect(() => {
    let cancelled = false;

    async function loadTheme() {
      try {
        const response = await fetch("/api/store-settings", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as StoreSettings;
        if (cancelled) return;

        const root = document.documentElement;
        const body = document.body;

        root.style.setProperty("--primary", data.primaryColor ?? "#b700ff");
        root.style.setProperty("--secondary", data.secondaryColor ?? "#6400ff");

        body.dataset.storeBackground = data.backgroundType ?? "lines";

        if (data.backgroundImageUrl) {
          body.style.backgroundImage = `url(${data.backgroundImageUrl})`;
          body.style.backgroundSize = "cover";
          body.style.backgroundPosition = "center";
        } else {
          body.style.backgroundImage = "";
          body.style.backgroundSize = "";
          body.style.backgroundPosition = "";
        }

        const tagId = "store-custom-background";
        const previousTag = document.getElementById(tagId);
        if (previousTag) previousTag.remove();

        if (data.backgroundCss) {
          const styleTag = document.createElement("style");
          styleTag.id = tagId;
          styleTag.innerHTML = `body { ${data.backgroundCss} }`;
          document.head.appendChild(styleTag);
        }
      } catch {
        // silent fallback
      }
    }

    loadTheme();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
