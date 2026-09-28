// Identifica o tipo REAL do arquivo pelos primeiros bytes. Nome e Content-Type
// enviados pelo cliente são controlados por quem faz o upload — usar a
// extensão do nome permitia gravar ".svg"/".html" com type "image/png" e
// servir isso do mesmo domínio (XSS armazenado).
export type SniffedFile = { ext: string; mime: string; kind: "image" | "video" | "pdf" };

export function sniffFile(buf: Buffer): SniffedFile | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { ext: ".png", mime: "image/png", kind: "image" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: ".jpg", mime: "image/jpeg", kind: "image" };
  if (buf.toString("ascii", 0, 3) === "GIF") return { ext: ".gif", mime: "image/gif", kind: "image" };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: ".webp", mime: "image/webp", kind: "image" };
  if (buf.toString("ascii", 0, 5) === "%PDF-") return { ext: ".pdf", mime: "application/pdf", kind: "pdf" };
  if (buf.toString("ascii", 4, 8) === "ftyp") return { ext: ".mp4", mime: "video/mp4", kind: "video" };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { ext: ".webm", mime: "video/webm", kind: "video" };
  return null;
}
