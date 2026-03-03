import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

type RouteParams = {
  params: Promise<{ id: string; target: string }>;
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const BANNED_EXTENSIONS = [".exe", ".bat", ".cmd", ".sh", ".php", ".js", ".vbs"];

export async function POST(req: Request, { params }: RouteParams) {
  const { id, target } = await params;

  try {
    const formData = await req.formData();
    const type = formData.get("type") as string;
    let content = (formData.get("content") as string) || "";
    const file = formData.get("file") as File | null;

    if (type === "file" && file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return fail("ARQUIVO_MUITO_GRANDE", 400);
      }

      const fileName = file.name.toLowerCase();
      const isBanned = BANNED_EXTENSIONS.some(ext => fileName.endsWith(ext));
      if (isBanned) {
        return fail("TIPO_DE_ARQUIVO_PROIBIDO", 400);
      }

      const uploadDir = join(process.cwd(), "uploads", "products");
      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }

      const uniqueName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const filePath = join(uploadDir, uniqueName);

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(filePath, buffer);

      content = uniqueName; 
    }

    let count = 0;
    if (type === "key") {
      count = content.split("\n").map(k => k.trim()).filter(k => k).length;
    } else if (type === "infinite") {
      count = 999999;
    } else if (type === "file") {
      count = content ? 1 : 0;
    }

    const db = getDB();
    const table = target === "variation" ? "product_variations" : "products";

    await db.query(
      `UPDATE ${table} 
       SET stock_type = $1, 
           stock_content = $2, 
           stock_count = $3 
       WHERE id = $4`,
      [type, content, count, id]
    );

    return ok({ message: "UPDATED", count, fileName: content }, 200);
  } catch (error) {
    console.error("UPDATE_ERROR", error);
    return fail("STOCK_UPDATE_ERROR", 500);
  }
}