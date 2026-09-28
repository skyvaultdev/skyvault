import type { CSSProperties, ReactNode } from "react";

// Conjunto próprio de ícones (traço fino, herda a cor do texto) usado no lugar
// dos emojis do sistema, para manter a identidade visual igual em qualquer
// dispositivo.
const PATHS = {
  home: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></>,
  palette: <><path d="M12 3a9 9 0 100 18c1.2 0 1.8-.9 1.5-1.9-.4-1.1.3-2.1 1.5-2.1H17a4 4 0 004-4c0-5-4-10-9-10z" /><circle cx="7.5" cy="11" r=".8" /><circle cx="10" cy="7" r=".8" /><circle cx="15" cy="7.5" r=".8" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.7" /><path d="M21 16l-5-5-8 8" /></>,
  layers: <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" />,
  box: <><path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z" /><path d="M3 7.5l9 4.5 9-4.5M12 12v9" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12h6M9 16h4" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 3.5M12 17v.01" /></>,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />,
  chat: <path d="M4 5h16v11H9l-5 4V5z" />,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></>,
  truck: <><path d="M2 6h11v10H2zM13 9h4l4 3v4h-8" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  card: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6 15h4" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5.2a3 3 0 010 5.6M18 14.8c1.8.7 3 2.3 3 5.2" /></>,
  handshake: <path d="M2 11l4-4 4 1 3-2 5 3 4-1v6l-5 4-3-1-2 2-4-3-3 1-3-3v-3zM8 14l3 2" />,
  layout: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>,
  shield: <path d="M12 3l8 3v6c0 4.5-3.3 7.8-8 9-4.7-1.2-8-4.5-8-9V6l8-3z" />,
  thumbUp: <path d="M7 11v9H4v-9h3zM7 11l4-8c1.7 0 2.5 1.3 2 3l-.7 3H19a2 2 0 012 2.3l-1 6A2 2 0 0118 19H7" />,
  thumbDown: <path d="M7 13V4H4v9h3zM7 13l4 8c1.7 0 2.5-1.3 2-3l-.7-3H19a2 2 0 002-2.3l-1-6A2 2 0 0018 5H7" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M4 20h16" />,
  upload: <path d="M12 16V5M7 9l5-5 5 5M4 20h16" />,
  fire: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 .3 1.5 1 2 2 2-1-3 0-5 1-8z" />,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" /></>,
  chart: <path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8" />,
  folder: <path d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V6z" />,
  megaphone: <path d="M3 10v4h4l9 5V5L7 10H3zM19 9a4 4 0 010 6" />,
  gem: <path d="M6 4h12l3 5-9 11L3 9l3-5zM3 9h18M9 4l3 5 3-5" />,
  check: <path d="M4 12.5l5 5L20 6.5" />,
  alert: <><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18v.01" /></>,
  save: <><path d="M4 4h13l3 3v13H4V4z" /><path d="M8 4v5h8V4M8 20v-6h8v6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  grip: <><circle cx="9" cy="6" r="1.2" /><circle cx="15" cy="6" r="1.2" /><circle cx="9" cy="12" r="1.2" /><circle cx="15" cy="12" r="1.2" /><circle cx="9" cy="18" r="1.2" /><circle cx="15" cy="18" r="1.2" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  bell: <path d="M6 16V11a6 6 0 1112 0v5l2 2H4l2-2zM10 21h4" />,
  bag: <><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></>,
  link: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></>,
  pix: <path d="M12 2l4.5 4.5L12 11 7.5 6.5 12 2zM12 13l4.5 4.5L12 22l-4.5-4.5L12 13zM2 12l4.5-4.5L11 12l-4.5 4.5L2 12zM13 12l4.5-4.5L22 12l-4.5 4.5L13 12z" />,
  pin: <><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>,
  send: <path d="M21 3L3 11l7 3 3 7 8-18zM10 14l11-11" />,
  reply: <path d="M10 8L4 13l6 5v-3c5 0 8 1 10 5-1-6-4-10-10-10V8z" />,
  bookmark: <path d="M6 3h12v18l-6-4-6 4V3z" />,
  refresh: <path d="M20 8a8 8 0 00-14-2M4 4v4h4M4 16a8 8 0 0014 2M20 20v-4h-4" />,
  sparkle: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />,
  tag: <><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="7.5" cy="8.5" r="1" /></>,
  paperclip: <path d="M20 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L14 7" />,
  file: <path d="M6 3h8l4 4v14H6V3zM14 3v4h4M9 12h6M9 16h6" />,
  store: <path d="M4 9l1.5-5h13L20 9M4 9a2.5 2.5 0 005 0 2.5 2.5 0 006 0 2.5 2.5 0 005 0M5 12v8h14v-8M10 20v-5h4v5" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" /></>,
  gift: <path d="M4 10h16v10H4V10zM3 7h18v3H3V7zM12 7v13M12 7c-2 0-4-.5-4-2.2S10 3 12 7c2-4 4-3.2 4-2.2S14 7 12 7z" />,
  ticket: <path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v3a2 2 0 000 4v3a2 2 0 00-2 2H5a2 2 0 00-2-2v-3a2 2 0 000-4V8zM14 6v12" />,
  pointer: <path d="M6 3l12 8-5 1.5L11 18 6 3z" />,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  route: <path d="M6 20a2 2 0 100-4 2 2 0 000 4zM18 8a2 2 0 100-4 2 2 0 000 4zM6 16V9a3 3 0 013-3h6M18 8v7a3 3 0 01-3 3H9" />,
  undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

type IconProps = {
  name: IconName;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  fill?: boolean;
};

export default function Icon({ name, size = "1.1em", className, style, title, fill }: IconProps) {
  return (
    <svg
      className={["ui-icon", className].filter(Boolean).join(" ")}
      style={{ verticalAlign: "-0.15em", flex: "0 0 auto", ...style }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {PATHS[name]}
    </svg>
  );
}
