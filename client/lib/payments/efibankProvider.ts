import crypto from "crypto";
import { efibankRequest } from "./efibankHttpClient";
import { loadEfibankCredentials, type EfibankCredentials } from "./efibankCredentials";
import type { PaymentProvider, ChargeRequest, ChargeResult } from "./PaymentProvider";

const PRODUCTION_HOST = "pix.api.efipay.com.br";
const SANDBOX_HOST = "pix-h.api.efipay.com.br";

// Cache em memória do access_token (client_credentials, válido por um
// tempo) — evita autenticar de novo a cada cobrança. Chave pelo hash das
// credenciais pra invalidar sozinho se elas mudarem (ex: dono troca o
// certificado na aba Configurações).
let cachedToken: { token: string; expiresAt: number; fingerprint: string } | null = null;

function fingerprint(creds: EfibankCredentials) {
  return crypto.createHash("sha256").update(creds.clientId + creds.clientSecret).digest("hex");
}

function hostFor(creds: EfibankCredentials) {
  return creds.sandbox ? SANDBOX_HOST : PRODUCTION_HOST;
}

async function getAccessToken(creds: EfibankCredentials): Promise<string> {
  const fp = fingerprint(creds);
  if (cachedToken && cachedToken.fingerprint === fp && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");

  const res = await efibankRequest<{ access_token: string; expires_in: number }>({
    method: "POST",
    host: hostFor(creds),
    path: "/oauth/token",
    pfx: creds.certPfx,
    passphrase: creds.certPassword,
    headers: { Authorization: `Basic ${basicAuth}` },
    body: { grant_type: "client_credentials" },
  });

  cachedToken = { token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000, fingerprint: fp };
  return res.access_token;
}

// txid da EfiBank: 26 a 35 caracteres, só [a-zA-Z0-9].
function generateTxid(): string {
  return crypto.randomBytes(20).toString("hex").slice(0, 32);
}

// Integração real — escrita a partir da documentação pública da API Pix
// da EfiBank (cobrança imediata via /v2/cob), mas nunca testada contra uma
// conta de verdade (sem credenciais até agora). Bem provável que precise
// de ajuste fino assim que o primeiro dono de loja configurar a dele.
export class EfibankPaymentProvider implements PaymentProvider {
  readonly name = "efibank" as const;

  async createCharge(req: ChargeRequest): Promise<ChargeResult> {
    const creds = await loadEfibankCredentials();
    if (!creds) {
      throw new Error("EfiBank não configurado — cadastre as credenciais na aba Configurações.");
    }

    const token = await getAccessToken(creds);
    const txid = generateTxid();

    const cob = await efibankRequest<{ status: string; pixCopiaECola?: string; loc?: { id: number } }>({
      method: "PUT",
      host: hostFor(creds),
      path: `/v2/cob/${txid}`,
      pfx: creds.certPfx,
      passphrase: creds.certPassword,
      headers: { Authorization: `Bearer ${token}` },
      body: {
        calendario: { expiracao: 3600 },
        valor: { original: req.amount.toFixed(2) },
        chave: creds.pixKey,
        solicitacaoPagador: `Pedido #${req.orderId}`,
      },
    });

    return {
      providerTxid: txid,
      status: "pending",
      pixCopyPaste: cob.pixCopiaECola,
      raw: cob,
    };
  }
}

// Chamado pelo webhook — nunca confia no payload que a EfiBank manda
// (não vem assinado), sempre confirma direto com nossas próprias
// credenciais antes de liberar qualquer coisa.
export async function getEfibankChargeStatus(txid: string): Promise<{ paid: boolean; raw: unknown }> {
  const creds = await loadEfibankCredentials();
  if (!creds) throw new Error("EfiBank não configurado.");

  const token = await getAccessToken(creds);
  const cob = await efibankRequest<{ status: string }>({
    method: "GET",
    host: hostFor(creds),
    path: `/v2/cob/${txid}`,
    pfx: creds.certPfx,
    passphrase: creds.certPassword,
    headers: { Authorization: `Bearer ${token}` },
  });

  return { paid: cob.status === "CONCLUIDA", raw: cob };
}

export async function registerEfibankWebhook(webhookUrl: string): Promise<void> {
  const creds = await loadEfibankCredentials();
  if (!creds) throw new Error("EfiBank não configurado.");

  const token = await getAccessToken(creds);
  await efibankRequest({
    method: "PUT",
    host: hostFor(creds),
    path: `/v2/webhook/${encodeURIComponent(creds.pixKey)}`,
    pfx: creds.certPfx,
    passphrase: creds.certPassword,
    headers: { Authorization: `Bearer ${token}` },
    body: { webhookUrl },
  });
}
