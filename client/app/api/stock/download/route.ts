import { NextResponse } from "next/server";
import { join } from "path";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { fail } from "@/lib/api/response";

export async function GET(req: Request) {
  var { searchParams } = new URL(req.url);
  var fileName = searchParams.get("file");

  if (!fileName) return fail("FILE_NOT_SPECIFIED", 400);
  var filePath = join(process.cwd(), "uploads", "products", fileName);

  if (!existsSync(filePath)) {
    return fail("FILE_NOT_FOUND", 404);
  }

  try {
    var fileBuffer = await readFile(filePath);
    
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "application/octet-stream",
      },
    });
  } catch (error) {
    return fail("DOWNLOAD_ERROR", 500);
  }
}