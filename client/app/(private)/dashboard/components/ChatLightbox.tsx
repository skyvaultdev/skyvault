"use client";

import { useEffect } from "react";

type MediaItem = {
  id: number | string;
  url: string;
  type: string;
  name?: string | null;
};

type ChatLightboxProps = {
  items: MediaItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

export default function ChatLightbox({ items, index, onClose, onIndexChange }: ChatLightboxProps) {
  const current = items[index];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < items.length - 1) onIndexChange(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, items.length, onClose, onIndexChange]);

  if (!current) return null;

  return (
    <div className="chatLightboxOverlay" onClick={onClose}>
      <button className="chatLightboxClose" onClick={onClose}>✕</button>

      {index > 0 && (
        <button
          className="chatLightboxArrow chatLightboxArrowLeft"
          onClick={(e) => { e.stopPropagation(); onIndexChange(index - 1); }}
        >
          ‹
        </button>
      )}

      <div className="chatLightboxContent" onClick={(e) => e.stopPropagation()}>
        {current.type.startsWith("video/") ? (
          <video src={current.url} controls autoPlay className="chatLightboxMedia" />
        ) : (
          <img src={current.url} alt={current.name ?? "anexo"} className="chatLightboxMedia" />
        )}
      </div>

      {index < items.length - 1 && (
        <button
          className="chatLightboxArrow chatLightboxArrowRight"
          onClick={(e) => { e.stopPropagation(); onIndexChange(index + 1); }}
        >
          ›
        </button>
      )}

      {items.length > 1 && (
        <div className="chatLightboxThumbs" onClick={(e) => e.stopPropagation()}>
          {items.map((item, i) => (
            <button
              key={item.id}
              className={`chatLightboxThumb ${i === index ? "active" : ""}`}
              onClick={() => onIndexChange(i)}
            >
              {item.type.startsWith("video/") ? (
                <video src={item.url} className="chatLightboxThumbMedia" muted />
              ) : (
                <img src={item.url} alt="" className="chatLightboxThumbMedia" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}