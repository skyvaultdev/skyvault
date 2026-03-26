import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";

type RouteParams = {
  params: Promise<{ id: string; target: string }>;
};

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const BANNED_EXTENSIONS = [".exe", ".bat", ".cmd", ".sh", ".php", ".js", ".vbs"];

export async function POST(req: Request, { params }: RouteParams) {
  const { id, target } = await params;

  try {
    const formData = await req.formData();
    const type = formData.get("type") as string;
    const ghostStock = formData.get("ghost_stock") as string;
    let content = (formData.get("content") as string) || "";
    let isUnlimited = (formData.get("is_unlimited") as boolean) || false;
    const file = formData.get("file") as File | null;

    if (type === "file" && file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) return fail("TOO_LARGE_FILE", 400);

      const fileName = file.name.toLowerCase();
      if (BANNED_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
        return fail("BANNED_FILE_EXTENSION", 400);
      }

      const uploadDir = join(process.cwd(), "stock", "products", "uploads");
      if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true });

      const uniqueName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const filePath = join(uploadDir, uniqueName);

      const bytes = await file.arrayBuffer();
      await writeFile(filePath, Buffer.from(bytes));

      content = uniqueName;
    }

    let count = 0;
    if (type === "key") {
      count = ghostStock ? parseInt(ghostStock) : 1;
    } else if (type === "infinite") {
      count = ghostStock ? parseInt(ghostStock) : 100;
    } else if (type === "file") {
      count = ghostStock ? parseInt(ghostStock) : 100;
    }
    
    const db = getDB();
    const table = target === "variation" ? "product_variations" : "products";
    await db.query(
      `UPDATE ${table} 
       SET stock_type = $1, 
           stock_content = $2, 
           stock_count = $3,
           is_unlimited = $5
       WHERE id = $4`,
      [type, content, count, id, isUnlimited]
    );

    return ok({ message: "UPDATED", count, fileName: content }, 200);

  } catch (error) {
    console.error("UPDATE_ERROR", error);
    return fail("STOCK_UPDATE_ERROR", 500);
  }
}