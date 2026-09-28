// Gerado uma vez, no boot do processo, só quando DEV_JWT_SECRET não está
// definido — nunca mais derivado de JWT_SECRET. A área /dev é
// deliberadamente isolada da autenticação normal da loja (um token de
// admin da loja comprometido não deve conseguir chegar lá); derivar o
// segredo de dev do mesmo JWT_SECRET principal anulava essa separação,
// já que quem soubesse um soubesse o outro. Efeito colateral aceitável:
// reiniciar o processo invalida sessões de /dev em aberto — área de baixo
// tráfego, super-admin só, não afeta clientes/loja.
//
// Usa a Web Crypto API (globalThis.crypto.getRandomValues), não o módulo
// "crypto" do Node — este arquivo é importado por middlewares/auth.middleware.ts,
// e todo middleware do Next roda em Edge Runtime por padrão, que não tem
// os módulos nativos do Node (só a API padrão de navegador/Edge).
function generateRandomHex(byteLength: number): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const generatedDevSecret = generateRandomHex(32);

export const config = {
    WEBSITE_URL: process.env.WEBSITE_URL || "http://localhost:3000",

    // Multi-loja: com ROOT_DOMAIN definido (ex: "minhaplataforma.com"), cada
    // loja é <slug>.ROOT_DOMAIN ou um custom_domain da tabela `stores`; host
    // desconhecido = 404. Sem ROOT_DOMAIN o app roda em modo loja única e
    // qualquer host cai em DEFAULT_STORE_ID.
    tenant: {
        rootDomain: (process.env.ROOT_DOMAIN || "").trim().toLowerCase(),
        defaultStoreId: Number(process.env.DEFAULT_STORE_ID) || 1,
    },

    jwt: {
        secret: process.env.JWT_SECRET!,
        expiresIn: process.env.JWT_EXPIRES_IN!,
    },

    database: {
        host: process.env.DB_HOST!,
        user: process.env.DB_USER!,
        password: process.env.DB_PASSWORD!,
        database: process.env.DB_NAME!,
        port: Number(process.env.DB_PORT),
    },

    google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },

    discord: {
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientToken: process.env.DISCORD_CLIENT_TOKEN!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        webhookUrl: process.env.WEBHOOK_URL!,
        scopes: process.env.DISCORD_SCOPES!,
    },
    
    payments: {
        provider: process.env.PAYMENT_PROVIDER || "auto",
        mercadoPago: {
            accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
            publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY,
            webhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET,
            sandbox: process.env.MERCADO_PAGO_SANDBOX === "true",
        },
    },
    devAuth: {
        secret: process.env.DEV_JWT_SECRET || generatedDevSecret,
        expiresIn: process.env.DEV_JWT_EXPIRES_IN || "12h",
    },
    shipping: {
        provider: process.env.SHIPPING_PROVIDER || "auto",
    },
};
