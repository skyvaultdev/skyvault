import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const productId = Number(id);

        if (isNaN(productId)) return fail("INVALID_ID", 400);

        const db = getDB();
        const formData = await req.formData();
        const name = String(formData.get("name") ?? "").trim();
        const rawSlug = String(formData.get("slug") ?? "").trim();
        const description = String(formData.get("description") ?? "").trim();
        const price = parseFloat(String(formData.get("price") ?? "0"));
        const categoryIdRaw = formData.get("category_id");
        const categoryId = categoryIdRaw ? Number(categoryIdRaw) : null;
        const active = formData.get("active") === "true";

        if (!name || isNaN(price)) return fail("MISSING_FIELDS", 400);

        const slug = slugify(rawSlug || name);
        const productUpdate = await db.query(
            `UPDATE products 
             SET name = $1, slug = $2, description = $3, price = $4, category_id = $5, active = $6 WHERE id = $7
             RETURNING *`,
            [name, slug, description, price, categoryId, active, productId]
        );

        if (productUpdate.rows.length === 0) return fail("NOT_FOUND", 404);
        const variationsRaw = formData.get("variations");
        if (variationsRaw) {
            const variations = JSON.parse(String(variationsRaw));
            await db.query("DELETE FROM product_variations WHERE product_id = $1", [productId]);
            
            for (const v of variations) {
                if (v.name && !isNaN(Number(v.price))) {
                    await db.query(
                        "INSERT INTO product_variations (product_id, name, price) VALUES ($1, $2, $3)",
                        [productId, v.name, Number(v.price)]
                    );
                }
            }
        }

        const existingImagesRaw = formData.get("existingImages");
        const existingImages = existingImagesRaw ? JSON.parse(String(existingImagesRaw)) : [];
        const newImages = formData.getAll("newImages").filter(i => i instanceof File) as File[];
        await db.query("DELETE FROM product_images WHERE product_id = $1", [productId]);

        let currentPosition = 0;
        for (const img of existingImages) {
            await db.query(
                "INSERT INTO product_images (product_id, url, position) VALUES ($1, $2, $3)",
                [productId, img.url, currentPosition++]
            );
        }

        if (newImages.length > 0) {
            const uploadDir = path.join(process.cwd(), "public/uploads/products");
            await mkdir(uploadDir, { recursive: true });

            for (const file of newImages) {
                const ext = path.extname(file.name) || ".jpg";
                const fileName = `${crypto.randomUUID()}${ext}`;
                const filePath = path.join(uploadDir, fileName);
                
                const buffer = Buffer.from(await file.arrayBuffer());
                await writeFile(filePath, buffer);

                await db.query(
                    "INSERT INTO product_images (product_id, url, position) VALUES ($1, $2, $3)",
                    [productId, `/uploads/products/${fileName}`, currentPosition++]
                );
            }
        }

        return ok({ message: "Produto atualizado com sucesso", product: productUpdate.rows[0] });

    } catch (error) {
        console.error("Erro na API de Edição:", error);
        return fail("INTERNAL_ERROR", 500);
    }
}

export async function PATCH(req: Request, ctx: Params) {
    return PUT(req, ctx);
}