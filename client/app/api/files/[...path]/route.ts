import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/jwt/init";
import { getDB } from "@/lib/database/db";
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

    const cookieStore = await cookies();
    var token = cookieStore.get("auth_token")?.value;
    if (!token) {
        return new NextResponse("UNAUTHORIZED", { status: 401 });
    }

    var payload = await verifyJWT(token);
    if (!payload) {
        return new NextResponse("UNAUTHORIZED", { status: 401 });
    }

    var filePath: string;

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
        if (!payload.permissions?.includes("products.read")) {
            return new NextResponse("UNAUTHORIZED", { status: 401 });
        }
        filePath = path.join(process.cwd(), "stock", ...pathArray);
    }

    if (!fs.existsSync(filePath)) {
        return new NextResponse("FILE_NOT_FOUND", { status: 404 });
    }

    try {
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        const baseHeaders: Record<string, string> = {
            "Content-Type": contentType,
            "Content-Disposition": "inline",
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=31536000, immutable",
        };

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