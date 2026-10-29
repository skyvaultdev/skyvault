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

// Mesma ideia de sniffFile() (byte real, não extensão/Content-Type que
// quem faz upload controla), só que pro produto digital tipo "file" —
// esse aceita QUALQUER coisa que uma loja venda como produto (instalador,
// e-book, música, vídeo, imagem...), não só imagem/vídeo/pdf. Usado só em
// app/api/stock/update/[target]/[id]/route.ts — NUNCA reaproveite isso
// pra upload de imagem/logo/anexo de chat (essas rotas continuam usando
// sniffFile() puro, de propósito: não faz sentido aceitar um .exe como
// logo da loja).
export type SniffedDigitalFile = { ext: string; mime: string };

export function sniffDigitalProductFile(buf: Buffer): SniffedDigitalFile | null {
  const base = sniffFile(buf);
  if (base) return { ext: base.ext, mime: base.mime };

  if (buf.length < 4) return null;

  // ZIP (e qualquer coisa baseada em zip — epub, docx, apk...) — PK\x03\x04
  // é o normal; \x05\x06/\x07\x08 cobrem arquivo vazio/fragmentado.
  if (
    buf[0] === 0x50 && buf[1] === 0x4b &&
    ((buf[2] === 0x03 && buf[3] === 0x04) || (buf[2] === 0x05 && buf[3] === 0x06) || (buf[2] === 0x07 && buf[3] === 0x08))
  ) {
    return { ext: ".zip", mime: "application/zip" };
  }

  // RAR (v4 e v5 começam igual nos primeiros 6 bytes: "Rar!\x1A\x07")
  if (buf.length >= 6 && buf.toString("ascii", 0, 4) === "Rar!" && buf[4] === 0x1a && buf[5] === 0x07) {
    return { ext: ".rar", mime: "application/vnd.rar" };
  }

  // 7-Zip — 37 7A BC AF 27 1C
  if (buf.length >= 6 && buf[0] === 0x37 && buf[1] === 0x7a && buf[2] === 0xbc && buf[3] === 0xaf && buf[4] === 0x27 && buf[5] === 0x1c) {
    return { ext: ".7z", mime: "application/x-7z-compressed" };
  }

  // MP3 — header ID3v2 cobre a grande maioria dos arquivos de música
  // vendidos como produto (tag ID3 é escrita por praticamente todo
  // software de exportação/edição de áudio).
  if (buf.toString("ascii", 0, 3) === "ID3") {
    return { ext: ".mp3", mime: "audio/mpeg" };
  }
  // MP3 sem tag ID3 — sync frame MPEG cru (0xFFE0 com as duas versões/layer
  // mais comuns: 0xFFFB/0xFFF3/0xFFF2).
  if (buf[0] === 0xff && (buf[1] === 0xfb || buf[1] === 0xf3 || buf[1] === 0xf2)) {
    return { ext: ".mp3", mime: "audio/mpeg" };
  }

  // Executável (.exe/.dll, assinatura "MZ") e instalador MSI/OLE Compound
  // File ficam de FORA de propósito — o blocklist que isso substitui já
  // bania .exe explicitamente; essa é a mesma intenção, só verificada
  // pelos bytes reais em vez de confiar na extensão do nome.

  // Sem assinatura binária conhecida — aceita como texto só se o conteúdo
  // inteiro for ASCII/UTF-8 imprimível (cobre licença/chave em .txt, sem
  // abrir a porta pra qualquer binário desconhecido passar disfarçado de
  // "texto").
  if (isPrintableText(buf)) {
    return { ext: ".txt", mime: "text/plain" };
  }

  return null;
}

function isPrintableText(buf: Buffer): boolean {
  try {
    const text = buf.toString("utf-8");
    // Buffer->string->Buffer precisa bater: se não bater, não era UTF-8
    // válido de verdade (teria caracteres de substituição "silenciosos").
    if (!Buffer.from(text, "utf-8").equals(buf)) return false;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // Permite tab/LF/CR + qualquer coisa imprimível (inclusive acentos,
      // emojis etc.) — só bloqueia os bytes de controle C0 (0-8, 11-12,
      // 14-31) que não têm razão de aparecer num arquivo de texto.
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) return false;
    }
    return true;
  } catch {
    return false;
  }
}
