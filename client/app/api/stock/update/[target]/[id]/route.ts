import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";
import { logStockMovement } from "@/lib/stock/stockMovements";

type RouteParams = {
  params: Promise<{ id: string; target: string }>;
};

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const BANNED_EXTENSIONS = [".exe", ".bat", ".cmd", ".sh", ".php", ".js", ".vbs"];

export async function POST(req: Request, { params }: RouteParams) {
  const { session, denied } = await requirePermission("products.write");
  if (denied) return denied;

  var { id, target } = await params;

  try {
    var formData = await req.formData();
    var type = formData.get("type") as string;
    var ghostStock = formData.get("ghost_stock") as string;
    let content = (formData.get("content") as string) || "";
    let isUnlimited = (formData.get("is_unlimited") as boolean) || false;
    var file = formData.get("file") as File | null;

    if (type === "file" && file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) return fail("TOO_LARGE_FILE", 400);

      var fileName = file.name.toLowerCase();
      if (BANNED_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
        return fail("BANNED_FILE_EXTENSION", 400);
      }

      var uploadDir = join(process.cwd(), "stock", "products", "uploads");
      if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true });

      var uniqueName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      var filePath = join(uploadDir, uniqueName);

      var bytes = await file.arrayBuffer();
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
    var table = target === "variation" ? "product_variations" : "products";

    const beforeRes = await db.query(`SELECT stock_count, name FROM ${table} WHERE id = $1`, [id]);
    const before = beforeRes.rows[0];

    await db.query(
      `UPDATE ${table}
       SET stock_type = $1,
           stock_content = $2,
           stock_count = $3,
           is_unlimited = $5
       WHERE id = $4`,
      [type, content, count, id, isUnlimited]
    );

    if (before) {
      const delta = count - Number(before.stock_count ?? 0);
      let productId: number | null = null;
      let variationId: number | null = null;
      let productName = before.name;
      let variationName: string | null = null;
      if (target === "variation") {
        variationId = Number(id);
        const parentRes = await db.query(
          `SELECT p.name FROM product_variations v JOIN products p ON p.id = v.product_id WHERE v.id = $1`,
          [id]
        );
        productName = parentRes.rows[0]?.name ?? before.name;
        variationName = before.name;
      } else {
        productId = Number(id);
      }
      await logStockMovement(db, {
        productId, variationId, productName, variationName,
        change: delta, reason: "manual_adjustment", staffEmail: session?.email ?? null,
        note: "Configuração de estoque digital",
      });
    }

    return ok({ message: "UPDATED", count, fileName: content }, 200);

  } catch (error) {
    console.error("UPDATE_ERROR", error);
    return fail("STOCK_UPDATE_ERROR", 500);
  }
}