export const config = {
    WEBSITE_URL: "http://localhost:3000",

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

    discord: {
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientToken: process.env.DISCORD_CLIENT_TOKEN!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        webhookUrl: process.env.WEBHOOK_URL!,
        scopes: process.env.DISCORD_SCOPES!,
    },
};
