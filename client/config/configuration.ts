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

    // Segredo próprio pra chamadas internas servidor-a-servidor (hoje só
    // middlewares/auth.middleware.ts -> POST /api/internal/sync-user).
    // Antes isso reusava JWT_SECRET no header x-internal-secret — um valor
    // que também assina/verifica todo cookie de sessão. Separar os dois
    // significa que vazar um não compromete o outro.
    internalApi: {
        secret: process.env.INTERNAL_API_SECRET!,
        // Segunda camada além do segredo específico de cada rota interna
        // (internalApi.secret / cron.secret) — exigida em TODAS as rotas
        // /api/internal/** via header x-internal-orchestrator. Não
        // substitui bloquear essas rotas no proxy/reverse-proxy pra
        // tráfego externo (a mitigação de rede continua sendo a correta
        // quando existir um proxy na frente) — é defesa em camadas pro
        // caso de um dos dois segredos vazar sozinho.
        orchestratorToken: process.env.INTERNAL_ORCHESTRATOR_TOKEN,
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
    orders: {
        // Depois de quantas horas sem pagamento um pedido pending_payment
        // vira "expired" (ver lib/orders/expirePendingOrders.ts).
        expirationHours: Number(process.env.ORDER_EXPIRATION_HOURS) || 24,
        // Depois de quantas horas sem mudança um carrinho é considerado
        // abandonado pra fins de e-mail de recuperação (ver
        // lib/orders/sendAbandonedCartEmails.ts).
        abandonedCartHours: Number(process.env.ABANDONED_CART_HOURS) || 24,
    },
    cron: {
        // Protege POST /api/internal/cron/expire-orders — exigido no header
        // x-cron-secret. Sem isso configurado, a rota recusa qualquer chamada.
        secret: process.env.CRON_SECRET,
    },

    // Chave de criptografia em repouso de chat_messages.body (ver
    // lib/chat/messageCrypto.ts). Antes vivia em store_settings, no MESMO
    // banco que guarda o conteúdo cifrado — um dump do banco trazia os
    // dois juntos, anulando a proteção pretendida (ver achado da revisão
    // de segurança). Agora é obrigatória, lida só daqui, nunca gerada/
    // persistida pelo app — perder/trocar esse valor torna toda mensagem
    // já gravada permanentemente ilegível, por isso NÃO tem fallback
    // gerado por boot (ao contrário de devAuth.secret).
    chat: {
        encryptionKey: process.env.CHAT_ENCRYPTION_KEY,
    },

    redis: {
        // Opcional — lib/security/rateLimit.ts usa isso pra compartilhar o
        // contador de rate limit entre múltiplas instâncias/réplicas do
        // app. Sem configurar, cai automaticamente pro fallback em memória
        // (correto só com uma única instância rodando).
        url: process.env.REDIS_URL,
    },

    // Pixels de analytics/conversão — opcionais, cada loja configura os
    // próprios IDs. Sem nenhum definido, nenhum script extra é carregado
    // (ver app/(components)/analytics/AnalyticsScripts.tsx).
    analytics: {
        ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || null,
        metaPixelId: process.env.META_PIXEL_ID || null,
    },

    // Quem fornece a tecnologia (a plataforma, não a loja) — único lugar
    // configurável pra esse nome/contato. O contrato da plataforma
    // (app/(public)/termos-plataforma) e o rodapé da loja interpolam a
    // partir daqui, nunca com o nome escrito fixo no texto.
    platform: {
        legalName: process.env.PLATFORM_LEGAL_NAME!,
        contactEmail: process.env.PLATFORM_CONTACT_EMAIL!,
    },
};
