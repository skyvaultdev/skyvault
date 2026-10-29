import { describe, it, expect } from "vitest";
import { sniffFile, sniffDigitalProductFile } from "./sniffFile";

function pad(bytes: number[], length = 16): Buffer {
  const buf = Buffer.alloc(Math.max(length, bytes.length));
  Buffer.from(bytes).copy(buf);
  return buf;
}

describe("sniffFile (imagem/vídeo/pdf)", () => {
  it("reconhece PNG, JPEG, GIF, WEBP, PDF, MP4, WEBM pelos bytes reais", () => {
    expect(sniffFile(pad([0x89, 0x50, 0x4e, 0x47]))?.ext).toBe(".png");
    expect(sniffFile(pad([0xff, 0xd8, 0xff]))?.ext).toBe(".jpg");
    expect(sniffFile(Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(10)]))?.ext).toBe(".gif");
    expect(sniffFile(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]))?.ext).toBe(".webp");
    expect(sniffFile(Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(8)]))?.ext).toBe(".pdf");
    expect(sniffFile(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypmp42"), Buffer.alloc(4)]))?.ext).toBe(".mp4");
    expect(sniffFile(pad([0x1a, 0x45, 0xdf, 0xa3]))?.ext).toBe(".webm");
  });

  it("devolve null pra conteúdo não reconhecido ou buffer curto demais", () => {
    expect(sniffFile(pad([0x00, 0x01, 0x02, 0x03]))).toBeNull();
    expect(sniffFile(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});

describe("sniffDigitalProductFile", () => {
  it("reconhece imagem/vídeo/pdf (mesma lógica de sniffFile)", () => {
    expect(sniffDigitalProductFile(pad([0x89, 0x50, 0x4e, 0x47]))?.ext).toBe(".png");
  });

  it("reconhece ZIP (PK\\x03\\x04)", () => {
    expect(sniffDigitalProductFile(pad([0x50, 0x4b, 0x03, 0x04]))?.ext).toBe(".zip");
  });

  it("reconhece RAR", () => {
    const buf = Buffer.concat([Buffer.from("Rar!"), Buffer.from([0x1a, 0x07, 0x00]), Buffer.alloc(10)]);
    expect(sniffDigitalProductFile(buf)?.ext).toBe(".rar");
  });

  it("reconhece 7-Zip", () => {
    expect(sniffDigitalProductFile(pad([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))?.ext).toBe(".7z");
  });

  it("reconhece MP3 com tag ID3", () => {
    const buf = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(13)]);
    expect(sniffDigitalProductFile(buf)?.ext).toBe(".mp3");
  });

  it("reconhece MP3 sem tag ID3 (frame sync MPEG cru)", () => {
    expect(sniffDigitalProductFile(pad([0xff, 0xfb, 0x90, 0x00]))?.ext).toBe(".mp3");
  });

  it("aceita texto puro (ASCII/UTF-8 imprimível) como .txt", () => {
    const buf = Buffer.from("CHAVE-DE-LICENCA: ABCD-1234-EFGH-5678\nVálido até 2030.", "utf-8");
    expect(sniffDigitalProductFile(buf)?.ext).toBe(".txt");
  });

  it("recusa um executável Windows (assinatura MZ) — mesma intenção do blocklist antigo", () => {
    expect(sniffDigitalProductFile(pad([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it("recusa binário aleatório sem assinatura conhecida e que não é texto imprimível", () => {
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xfe, 0xfd, 0x80, 0x81, 0x90, 0xa0, 0xb0, 0xc0]);
    expect(sniffDigitalProductFile(garbage)).toBeNull();
  });

  it("um .exe renomeado pra .zip (bytes continuam MZ) ainda é recusado — não confia na extensão do nome", () => {
    // O chamador (route.ts) nunca passa o nome do arquivo pra essa função —
    // isso aqui só prova que a decisão é 100% pelos bytes.
    const fakeZip = pad([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    expect(sniffDigitalProductFile(fakeZip)).toBeNull();
  });
});
