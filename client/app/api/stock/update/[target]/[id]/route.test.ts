import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";
import { signJWT } from "@/lib/jwt/init";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "auth_token" && cookieValue ? { value: cookieValue } : undefined) }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

const { POST } = await import("./route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

afterEach(() => {
  cookieValue = undefined;
});

function paramsFor(target: string, id: string) {
  return { params: Promise.resolve({ target, id }) };
}

function uploadRequest(fields: Record<string, string>, file?: { name: string; bytes: Uint8Array; type?: string }) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (file) {
    form.append("file", new File([Buffer.from(file.bytes)], file.name, { type: file.type ?? "application/octet-stream" }));
  }
  return new Request("https://example.com/api/stock/update/product/1", {
    method: "POST",
    body: form,
  });
}

const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]);
const FAKE_EXE_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);

describe("POST /api/stock/update/[target]/[id] — upload de produto digital tipo file", () => {
  let productId: number;
  let uploadedFileName: string | undefined;

  beforeAll(async () => {
    const db = getDB();
    const res = await db.query(
      `INSERT INTO products (name, price, product_type, stock_type, stock_count, is_unlimited, active)
       VALUES ($1, 10, 'digital', 'file', 0, false, true) RETURNING id`,
      ["[TESTE] Produto Upload Arquivo"]
    );
    productId = res.rows[0].id;
  });

  afterAll(async () => {
    const db = getDB();
    await db.query(`DELETE FROM stock_movements WHERE product_id = $1`, [productId]).catch(() => {});
    await db.query(`DELETE FROM products WHERE id = $1`, [productId]);
    if (uploadedFileName) {
      const filePath = join(process.cwd(), "stock", "products", "uploads", uploadedFileName);
      if (existsSync(filePath)) unlinkSync(filePath);
    }
  });

  it("aceita um ZIP de verdade (bytes reais), renomeia com a extensão sniffada", async () => {
    cookieValue = await signJWT({ email: "staff-upload@teste.com", sid: 1, permissions: ["products.write"] });

    const res = await POST(
      uploadRequest({ type: "file", ghost_stock: "5" }, { name: "meu-produto.zip", bytes: ZIP_BYTES }),
      paramsFor("product", String(productId))
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.fileName).toMatch(/\.zip$/);
    uploadedFileName = json.data.fileName;

    const filePath = join(process.cwd(), "stock", "products", "uploads", uploadedFileName!);
    expect(existsSync(filePath)).toBe(true);

    const row = await getDB().query(`SELECT stock_content FROM products WHERE id = $1`, [productId]);
    expect(row.rows[0].stock_content).toBe(uploadedFileName);
  });

  it("recusa um .exe renomeado pra .zip — decide pelos bytes, não pela extensão do nome", async () => {
    cookieValue = await signJWT({ email: "staff-upload-2@teste.com", sid: 1, permissions: ["products.write"] });

    const res = await POST(
      uploadRequest({ type: "file", ghost_stock: "5" }, { name: "disfarcado.zip", bytes: FAKE_EXE_BYTES }),
      paramsFor("product", String(productId))
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("recusa sem a permissão products.write", async () => {
    cookieValue = await signJWT({ email: "sem-permissao@teste.com", sid: 1, permissions: [] });

    const res = await POST(
      uploadRequest({ type: "file", ghost_stock: "5" }, { name: "qualquer.zip", bytes: ZIP_BYTES }),
      paramsFor("product", String(productId))
    );
    expect(res.status).not.toBe(200);
  });
});
