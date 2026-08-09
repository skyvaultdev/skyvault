"use client";

import { useEffect, useRef } from "react";
import "./ChatShared.css";

export type ChatContextMenuItem = {
  label: string;
  onClick: () => void;
  danger?: boolean;
};

type ChatContextMenuProps = {
  x: number;
  y: number;
  items: ChatContextMenuItem[];
  onClose: () => void;
};

export default function ChatContextMenu({ x, y, items, onClose }: ChatContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const style = computeMenuPosition(x, y);

  return (
    <div ref={menuRef} className="chatContextMenu" style={style} role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`chatContextMenuItem${item.danger ? " danger" : ""}`}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function computeMenuPosition(x: number, y: number): { left: number; top: number } {
  if (typeof window === "undefined") return { left: x, top: y };
  const width = 190;
  const height = 100;
  return {
    left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
  };
}
