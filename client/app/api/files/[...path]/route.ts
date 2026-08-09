import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/jwt/init";
import fs from "fs";
import path from "path";

type RouteParams = {
    params: Promise<{ path: string[] }>;
};

export async function GET(req: Request, { params }: RouteParams) {
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

    var payload = (await verifyJWT(token));
    var permissions = payload.permissions;
    if(!payload.permissions.includes("products.read")) { return new NextResponse("UNAUTHORIZED", { status: 401 }) }

    var filePath = path.join(process.cwd(), "stock", ...pathArray);
    if (!fs.existsSync(filePath)) {
        return new NextResponse("FILE_NOT_FOUND", { status: 404 });
    }

    try {
        var fileBuffer = fs.readFileSync(filePath);
        var ext = path.extname(filePath).toLowerCase();
        var mimeTypes: { [key: string]: string } = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
            ".pdf": "application/pdf",
        };

        var contentType = mimeTypes[ext] || "application/octet-stream";
        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": "inline"
            },
        });
    } catch (error) {
        console.error("ERROR_ON_READING_FILE:", error);
        return new NextResponse("INTERNAL_SERVER_ERROR", { status: 500 });
    }
}