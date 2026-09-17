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
        provider: process.env.PAYMENT_PROVIDER || "auto",
        mercadoPago: {
            accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
            publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY,
            webhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET,
            sandbox: process.env.MERCADO_PAGO_SANDBOX === "true",
        },
    },
    devAuth: {
        secret: process.env.DEV_JWT_SECRET || `dev::${process.env.JWT_SECRET}`,
        expiresIn: process.env.DEV_JWT_EXPIRES_IN || "12h",
    },
    shipping: {
        provider: process.env.SHIPPING_PROVIDER || "auto",
    },
};
