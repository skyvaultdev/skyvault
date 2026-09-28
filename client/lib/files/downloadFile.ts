// Baixa um arquivo via fetch+blob em vez de navegar/abrir aba nova — antes
// os links de "Baixar arquivo" só faziam <a href target="_blank">, e como
// a rota servia tudo com Content-Disposition: inline, o navegador abria o
// arquivo (imagem, PDF) na aba em vez de baixar. Isso baixa direto, sem
// abrir nenhuma aba, e ainda funciona se a rota mandar ?download=1 (ver
// app/api/files/[...path]/route.ts).
export async function downloadFile(url: string, filename: string): Promise<void> {
  const separator = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${separator}download=1`);
  if (!res.ok) throw new Error("DOWNLOAD_FAILED");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

const FILE_DOWNLOAD_PREFIX = "/api/files/products/uploads/";

// Nome do arquivo pro usuário, sem o prefixo "timestamp-" usado só pra
// evitar colisão no disco (mesma convenção do server, ver serveFile()).
export function extractDownloadFilename(fileUrl: string): string {
  const raw = fileUrl.startsWith(FILE_DOWNLOAD_PREFIX)
    ? fileUrl.slice(FILE_DOWNLOAD_PREFIX.length)
    : fileUrl.split("/").pop() || "arquivo";
  const withoutQuery = raw.split("?")[0];
  return decodeURIComponent(withoutQuery.replace(/^\d+-/, "") || withoutQuery);
}
