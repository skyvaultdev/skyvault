import { SignJWT, jwtVerify } from "jose";
import { config } from "@/config/configuration";

const secret = new TextEncoder().encode(config.jwt.secret);

// Token de download assinado, só pro link de arquivo que vai no e-mail de
// entrega — diferente do resto do app (que usa a sessão logada pra
// conferir posse do arquivo), o e-mail pode ser aberto num dispositivo sem
// sessão ativa (celular, dias depois). "purpose" evita que esse token seja
// confundido com um JWT de sessão normal (que tem email/role, não isso), e
// "filename" amarra o token a UM arquivo específico — não dá pra reusar
// pra baixar outro arquivo qualquer trocando o nome na URL.
type DownloadTokenPayload = {
  purpose: "email_download";
  orderId: number;
  filename: string;
};

export async function signDownloadToken(orderId: number, filename: string): Promise<string> {
  return new SignJWT({ purpose: "email_download", orderId, filename } satisfies DownloadTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

// Devolve o orderId codificado se o token for válido, bater com o
// "filename" pedido, e ainda não tiver expirado — null em qualquer outro
// caso (assinatura inválida, purpose errado, nome de arquivo diferente).
export async function verifyDownloadToken(token: string, filename: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.purpose !== "email_download") return null;
    if (payload.filename !== filename) return null;
    const orderId = Number(payload.orderId);
    return Number.isFinite(orderId) ? orderId : null;
  } catch {
    return null;
  }
}
