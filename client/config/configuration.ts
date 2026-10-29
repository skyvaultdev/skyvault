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

        // Item C1 — validação de Host, desligada por padrão (sem mudar o
        // comportamento atual até alguém ligar de propósito, depois de
        // confirmar a topologia real de proxy/CDN em produção). Ver
        // docs/security/host-validation.md pra como escolher o valor certo.
        //   off     (padrão) — Host puro, sem checagem extra, como hoje.
        //   report  — calcula o host "efetivo" (considerando
        //             TRUSTED_PROXY) e loga se ele divergiria do Host
        //             puro ou cairia fora da allowlist, mas resolve a
        //             loja com o Host puro mesmo (nenhuma mudança real).
        //   enforce — resolve a loja com o host efetivo de verdade.
        hostValidationMode: (() => {
            const raw = process.env.HOST_VALIDATION;
            return raw === "report" || raw === "enforce" ? raw : "off";
        })(),

        // Só é considerado quando TRUSTED_PROXY=true — do contrário,
        // X-Forwarded-Host é ignorado por completo (header que qualquer
        // cliente pode mandar; só vale confiar nele quando HÁ de fato um
        // proxy na frente que o sobrescreve com o valor real).
        trustedProxy: process.env.TRUSTED_PROXY === "true",

        // Hosts aceitos ALÉM dos domínios cadastrados na tabela `stores`
        // (custom_domain/slug) — tratados como o domínio raiz: resolvem
        // pra DEFAULT_STORE_ID em vez de precisar de uma linha em `stores`.
        allowedHosts: (process.env.ALLOWED_HOSTS || "")
            .split(",")
            .map((h) => h.trim().toLowerCase())
            .filter(Boolean),
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

    // Item B3: defesa contra CSRF via Sec-Fetch-Site/Origin em rotas
    // mutáveis (POST/PUT/PATCH/DELETE), ver lib/security/csrfGuard.ts e
    // proxy.ts. "report" (padrão) só loga o que seria bloqueado, nunca
    // recusa nada — promover pra "enforce" é decisão de quem administra,
    // depois de observar os logs por um tempo.
    csrf: {
        mode: process.env.CSRF_MODE === "enforce" ? "enforce" as const : "report" as const,
    },

    // Chave de criptografia em repouso de credenciais de integração (hoje:
    // melhor_envio_credentials.access_token_encrypted — ver
    // lib/security/tokenCrypto.ts). Antes a chave vinha de sha256(JWT_SECRET)
    // — reaproveitava o segredo de SESSÃO como chave de DADOS em repouso;
    // rotacionar JWT_SECRET por um incidente quebraria silenciosamente a
    // decifragem de toda credencial salva, sem aviso nenhum. Obrigatória em
    // produção (checado no boot, ver instrumentation.ts) — em dev/teste,
    // falta dela só derruba na hora de cifrar/decifrar de verdade.
    integration: {
        encryptionKey: process.env.INTEGRATION_ENCRYPTION_KEY,
    },

    database: {
        host: process.env.DB_HOST!,
        user: process.env.DB_USER!,
        password: process.env.DB_PASSWORD!,
        database: process.env.DB_NAME!,
        port: Number(process.env.DB_PORT),
        // TLS mútuo (CA + certificado + chave de cliente) — a Square Cloud
        // exige isso pro Postgres gerenciado. Conteúdo em base64 via env,
        // NUNCA um arquivo no pacote de deploy (ver docs/deploy/squarecloud.md).
        // As 3 ausentes (dev local) = sem TLS, comportamento de sempre — a
        // decodificação e o objeto `ssl` em si ficam em lib/database/pool.ts,
        // não aqui (este arquivo também é importado em Edge Runtime, por
        // middlewares/auth.middleware.ts, que não tem o Buffer do Node).
        sslCaBase64: process.env.DB_SSL_CA_BASE64,
        sslCertBase64: process.env.DB_SSL_CERT_BASE64,
        sslKeyBase64: process.env.DB_SSL_KEY_BASE64,
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
        // TLS mútuo opcional, mesmo esquema do Postgres acima (base64 via
        // env, decodificado em lib/security/rateLimit.ts). Só faz sentido
        // com REDIS_URL já configurada.
        sslCaBase64: process.env.REDIS_SSL_CA_BASE64,
        sslCertBase64: process.env.REDIS_SSL_CERT_BASE64,
        sslKeyBase64: process.env.REDIS_SSL_KEY_BASE64,
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
