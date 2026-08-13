export const config = {
    WEBSITE_URL: process.env.WEBSITE_URL || "http://localhost:3000",

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
        // Credenciais reais da EfiBank não vêm mais de env var — ficam no
        // banco (tabela efibank_credentials), criptografadas, cadastradas
        // pelos DEVS na dashboard exclusiva (/dev). Isso aqui só permite
        // forçar mock mesmo com credenciais salvas (dev local).
        provider: process.env.PAYMENT_PROVIDER || "mock",
    },

    devAuth: {
        // Auth da dashboard de devs é isolada da auth da loja de propósito
        // (cookie e segredo de assinatura separados) — mesmo que alguém
        // arranje um jeito de forjar/roubar um token de admin da loja, ele
        // não serve pra dashboard de dev. Defina DEV_JWT_SECRET em produção;
        // sem ele, cai num fallback derivado do JWT_SECRET só pra dev local.
        secret: process.env.DEV_JWT_SECRET || `dev::${process.env.JWT_SECRET}`,
        expiresIn: process.env.DEV_JWT_EXPIRES_IN || "12h",
    },

    shipping: {
        // "fixed_table" (tabela de peso configurável, sem depender de API
        // externa) até vocês terem o token do Melhor Envio — aí troca pra
        // "melhor_envio" e a cotação passa a ser real, com múltiplas
        // transportadoras de verdade.
        provider: process.env.SHIPPING_PROVIDER || "fixed_table",
        melhorEnvio: {
            token: process.env.MELHOR_ENVIO_TOKEN,
            sandbox: process.env.MELHOR_ENVIO_SANDBOX !== "false",
            // Exigido pela Melhor Envio em todo request (identifica a
            // aplicação + contato) — formato: "NomeDaApp (email@contato.com)".
            userAgent: process.env.MELHOR_ENVIO_USER_AGENT || "SkyVault (contato@skyvault.local)",
        },
    },
};
