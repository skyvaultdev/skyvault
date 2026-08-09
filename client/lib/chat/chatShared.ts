export const URL_REGEX = /(https?:\/\/[^\s<]+[^\s<.,;:!?'")\]])/gi;

const MEDIA_IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i;
const MEDIA_VIDEO_EXT = /\.(mp4|webm|mov|ogg|m4v)(\?.*)?$/i;
const MEDIA_AUDIO_EXT = /\.(mp3|wav|m4a)(\?.*)?$/i;

export type MediaKind = "image" | "video" | "audio" | null;

export function getMediaKind(url: string): MediaKind {
  if (MEDIA_IMAGE_EXT.test(url)) return "image";
  if (MEDIA_VIDEO_EXT.test(url)) return "video";
  if (MEDIA_AUDIO_EXT.test(url)) return "audio";
  return null;
}

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? Array.from(new Set(matches)) : [];
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const REPLY_PREFIX = "↳ Respondendo ";

export function buildReplyBody(senderLabel: string, quotedSnippet: string, text: string): string {
  const safeSender = senderLabel.replace(/\n/g, " ").trim() || "mensagem";
  const safeSnippet = truncate(quotedSnippet.replace(/\n/g, " "), 120) || "(anexo)";
  return `${REPLY_PREFIX}${safeSender}: ${safeSnippet}\n${text}`;
}

export type ParsedReply = {
  senderLabel: string;
  snippet: string;
  rest: string;
} | null;

export function parseReplyBody(body: string): ParsedReply {
  if (!body.startsWith(REPLY_PREFIX)) return null;
  const newlineIndex = body.indexOf("\n");
  if (newlineIndex === -1) return null;
  const headerLine = body.slice(REPLY_PREFIX.length, newlineIndex);
  const separatorIndex = headerLine.indexOf(": ");
  if (separatorIndex === -1) return null;
  return {
    senderLabel: headerLine.slice(0, separatorIndex),
    snippet: headerLine.slice(separatorIndex + 2),
    rest: body.slice(newlineIndex + 1),
  };
}
