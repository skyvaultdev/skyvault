import { config } from "@/config/configuration";

export type MercadoPagoCredentials = {
  accessToken: string;
  publicKey: string;
  webhookSecret: string | null;
  sandbox: boolean;
};

// Credenciais vêm do .env (MERCADO_PAGO_ACCESS_TOKEN / MERCADO_PAGO_PUBLIC_KEY)
// — não mais do banco. É a conta do dono da loja, só que configurada pelo
// próprio dono direto no servidor em vez de pela dashboard.
export async function loadMercadoPagoCredentials(): Promise<MercadoPagoCredentials | null> {
  const { accessToken, publicKey, webhookSecret, sandbox } = config.payments.mercadoPago;
  if (!accessToken || !publicKey) return null;

  return {
    accessToken,
    publicKey,
    webhookSecret: webhookSecret || null,
    sandbox,
  };
}

export async function isMercadoPagoConfigured(): Promise<boolean> {
  return (await loadMercadoPagoCredentials()) !== null;
}
