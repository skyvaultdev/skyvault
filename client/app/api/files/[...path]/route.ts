import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWTForStore } from "@/lib/jwt/storeAware";
import { getDB } from "@/lib/database/db";
import { verifyDownloadToken } from "@/lib/mail/downloadToken";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

type RouteParams = {
    path: string[];
};

type RouteContext = {
    params: Promise<RouteParams>;
};

const MIME_TYPES: { [key: string]: string } = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
};

export async function GET(req: Request, { params }: RouteContext) {
    var resolvedParams = await params;
    var pathArray = resolvedParams.path;

    if (pathArray.some(part => part.includes('..') || part.includes('/'))) {
        return new NextResponse("INVALID_PATH", { status: 403 });
    }

    var filePath: string;

    // Link do e-mail de entrega — assinado, com validade própria, não
    // depende de sessão logada (o e-mail pode ser aberto num dispositivo
    // sem login, dias depois da compra). Só existe pra arquivo de produto,
    // nunca pra anexo de chat. Se não tiver token (ou for inválido), cai
    // pro fluxo normal de sessão logo abaixo — não é obrigatório, só um
    // atalho a mais.
    const downloadTokenParam = new URL(req.url).searchParams.get("token");
    if (downloadTokenParam && pathArray[0] === "products" && pathArray[1] === "uploads" && pathArray[2]) {
        const filename = pathArray[2];
        const tokenOrderId = await verifyDownloadToken(downloadTokenParam, filename);
        if (tokenOrderId) {
            const orderCheck = await getDB().query(
                `SELECT 1 FROM orders WHERE id = $1 AND status IN ('paid', 'delivered')`,
                [tokenOrderId]
            );
            if (orderCheck.rows.length > 0) {
                filePath = path.join(process.cwd(), "stock", ...pathArray);
                return serveFile(req, filePath);
            }
            // Token válido mas o pedido não existe mais/foi cancelado/
            // reembolsado depois do e-mail ter sido enviado — não serve o
            // arquivo, mas também não é motivo pra travar: cai pro fluxo
            // normal de sessão (se o cliente estiver logado, ainda
            // consegue pela posse normal).
        }
    }

    const cookieStore = await cookies();
    var token = cookieStore.get("auth_token")?.value;
    if (!token) {
        return new NextResponse("UNAUTHORIZED", { status: 401 });
    }

    var payload = await verifyJWTForStore(token);
    if (!payload) {
        return new NextResponse("UNAUTHORIZED", { status: 401 });
    }

    if (pathArray[0] === "chat") {
        var filename = pathArray[1];
        if (!filename) return new NextResponse("INVALID_PATH", { status: 403 });

        var isStaff = !!payload.permissions?.includes("chat.access");
        if (!isStaff) {
            const db = getDB();
            const { rows } = await db.query(
                `SELECT 1 FROM chat_messages m
                 JOIN chat_conversations c ON c.id = m.conversation_id
                 WHERE m.attachment_url = $1 AND c.customer_email = $2 LIMIT 1`,
                [`/api/files/chat/${filename}`, payload.email]
            );
            if (rows.length === 0) return new NextResponse("FORBIDDEN", { status: 403 });
        }

        filePath = path.join(process.cwd(), "private", "chat", filename);
    } else {
        // Staff continua podendo baixar qualquer arquivo de produto (usado
        // em dashboard/stock/manage pra pré-visualizar o que foi cadastrado).
        // Cliente comum NÃO tem essa permissão — mas ele PRECISA conseguir
        // baixar o próprio arquivo que comprou (é esse o link enviado no
        // e-mail de entrega). Antes disso exigia "products.read" de
        // qualquer jeito, então todo cliente tomava 401 ao tentar baixar o
        // que pagou. Mesma lógica de posse usada em stock/deliver/route.ts
        // (confere pedido pago do usuário autenticado), só que reconstruída
        // a partir do nome do arquivo — essa rota só recebe o path, não
        // productId/orderId como o outro endpoint.
        const isStaff = !!payload.permissions?.includes("products.read");
        if (!isStaff) {
            if (pathArray[0] !== "products" || pathArray[1] !== "uploads" || !pathArray[2]) {
                return new NextResponse("FORBIDDEN", { status: 403 });
            }
            const filename = pathArray[2];
            const db = getDB();
            const { rows: userRows } = await db.query(`SELECT id FROM users WHERE email = $1`, [payload.email]);
            if (userRows.length === 0) return new NextResponse("UNAUTHORIZED", { status: 401 });
            const userId = userRows[0].id;

            const ownsFile = await db.query(
                `SELECT 1
                 FROM order_items oi
                 JOIN orders o ON o.id = oi.order_id
                 LEFT JOIN products p ON p.id = oi.product_id
                 LEFT JOIN product_variations v ON v.id = oi.variation_id
                 WHERE o.user_id = $1
                   AND o.status IN ('paid', 'delivered')
                   AND (
                     (p.stock_type = 'file' AND p.stock_content = $2) OR
                     (v.stock_type = 'file' AND v.stock_content = $2)
                   )
                 LIMIT 1`,
                [userId, filename]
            );
            if (ownsFile.rows.length === 0) return new NextResponse("FORBIDDEN", { status: 403 });
        }
        filePath = path.join(process.cwd(), "stock", ...pathArray);
    }

    return serveFile(req, filePath);
}

function serveFile(req: Request, filePath: string): NextResponse | Promise<NextResponse> {
    if (!fs.existsSync(filePath)) {
        return new NextResponse("FILE_NOT_FOUND", { status: 404 });
    }

    try {
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        // "inline" sempre (era fixo assim antes) fazia até imagem compradas
        // abrirem/pré-visualizarem no navegador em vez de baixar — o
        // atributo `download` do <a> não é suficiente sozinho em vários
        // cenários (link de email aberto fora do app, etc.). Quem quer
        // baixar de verdade passa ?download=1 (ver downloadFile() no
        // client e o link assinado de email); quem só quer exibir a
        // imagem num <img src=...> (preview no dashboard) não passa nada e
        // continua recebendo inline, senão a preview quebraria.
        const forceDownload = new URL(req.url).searchParams.get("download") === "1";
        const originalName = path.basename(filePath).replace(/^\d+-/, "") || path.basename(filePath);
        const asciiName = originalName.replace(/[^\x20-\x7E]/g, "_");

        const baseHeaders: Record<string, string> = {
            "Content-Type": contentType,
            "Content-Disposition": forceDownload
                ? `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(originalName)}`
                : "inline",
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        };
        // SVG pode carregar script: sem execução mesmo se aberto direto.
        if (ext === ".svg") baseHeaders["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

        const range = req.headers.get("range");

        if (range) {
            const match = /bytes=(\d*)-(\d*)/.exec(range);
            const start = match && match[1] ? parseInt(match[1], 10) : 0;
            const end = match && match[2] ? parseInt(match[2], 10) : fileSize - 1;

            if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= fileSize) {
                return new NextResponse(null, {
                    status: 416,
                    headers: { "Content-Range": `bytes */${fileSize}` },
                });
            }

            const chunkSize = end - start + 1;
            const nodeStream = fs.createReadStream(filePath, { start, end });
            const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

            return new NextResponse(webStream, {
                status: 206,
                headers: {
                    ...baseHeaders,
                    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                    "Content-Length": String(chunkSize),
                },
            });
        }

        const nodeStream = fs.createReadStream(filePath);
        const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

        return new NextResponse(webStream, {
            status: 200,
            headers: {
                ...baseHeaders,
                "Content-Length": String(fileSize),
            },
        });
    } catch (error) {
        console.error("ERROR_ON_READING_FILE:", error);
        return new NextResponse("INTERNAL_SERVER_ERROR", { status: 500 });
    }
}