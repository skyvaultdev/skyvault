import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { slugify } from "@/lib/utils/slugify";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requirePermission } from "@/lib/auth/guard";
import { logStockMovement } from "@/lib/stock/stockMovements";

type Params = { params: Promise<{ id: string }> };

var VALID_PRODUCT_TYPES = ["digital", "physical"];

export async function PUT(req: Request, { params }: Params) {
    try {
        const { session, denied } = await requirePermission("products.write");
        if (denied) return denied;
        const staffEmail = session?.email ?? null;

        var { id } = await params;
        var productId = Number(id);

        if (isNaN(productId)) return fail("INVALID_ID", 400);

        const db = getDB();
        var formData = await req.formData();
        var name = String(formData.get("name") ?? "").trim();
        var rawSlug = String(formData.get("slug") ?? "").trim();
        var description = String(formData.get("description") ?? "").trim();
        var price = parseFloat(String(formData.get("price") ?? "0"));
        var categoryIdRaw = formData.get("category_id");
        var categoryId = categoryIdRaw ? Number(categoryIdRaw) : null;
        var active = formData.get("active") === "true";

        var productTypeRaw = String(formData.get("product_type") ?? "digital");
        var productType = VALID_PRODUCT_TYPES.includes(productTypeRaw) ? productTypeRaw : "digital";
        var isPhysical = productType === "physical";

        var sku = isPhysical ? String(formData.get("sku") ?? "").trim() || null : null;
        var weightGrams = isPhysical && formData.get("weight_grams") ? Number(formData.get("weight_grams")) : null;
        var lengthCm = isPhysical && formData.get("length_cm") ? Number(formData.get("length_cm")) : null;
        var widthCm = isPhysical && formData.get("width_cm") ? Number(formData.get("width_cm")) : null;
        var heightCm = isPhysical && formData.get("height_cm") ? Number(formData.get("height_cm")) : null;

        if (!name || isNaN(price)) return fail("MISSING_FIELDS", 400);

        var slug = slugify(rawSlug || name);

        var productUpdate;
        if (isPhysical) {
            var stockIsUnlimited = formData.get("stock_is_unlimited") === "true";
            var stockCount = stockIsUnlimited ? 0 : Number(formData.get("stock_count") ?? 0) || 0;

            var beforeRes = await db.query("SELECT stock_count FROM products WHERE id = $1", [productId]);
            var stockBefore = Number(beforeRes.rows[0]?.stock_count ?? 0);

            productUpdate = await db.query(
                `UPDATE products
                 SET name = $1, slug = $2, description = $3, price = $4, category_id = $5, active = $6,
                     product_type = $7, sku = $8, weight_grams = $9, length_cm = $10, width_cm = $11, height_cm = $12,
                     stock_count = $13, is_unlimited = $14
                 WHERE id = $15
                 RETURNING *`,
                [
                    name, slug, description, price, categoryId, active,
                    productType, sku, weightGrams, lengthCm, widthCm, heightCm,
                    stockCount, stockIsUnlimited, productId,
                ]
            );

            if (!stockIsUnlimited && stockCount !== stockBefore) {
                await logStockMovement(db, {
                    productId, variationId: null, productName: name, change: stockCount - stockBefore,
                    reason: "manual_adjustment", staffEmail, note: "Editado no cadastro do produto",
                });
            }
        } else {
            productUpdate = await db.query(
                `UPDATE products
                 SET name = $1, slug = $2, description = $3, price = $4, category_id = $5, active = $6,
                     product_type = $7, sku = NULL, weight_grams = NULL, length_cm = NULL, width_cm = NULL, height_cm = NULL
                 WHERE id = $8
                 RETURNING *`,
                [name, slug, description, price, categoryId, active, productType, productId]
            );
        }

        if (productUpdate.rows.length === 0) return fail("NOT_FOUND", 404);

        var variationsRaw = formData.get("variations");
        if (variationsRaw) {
            var variations = JSON.parse(String(variationsRaw));
            await db.query("DELETE FROM product_variations WHERE product_id = $1", [productId]);

            for (var v of variations) {
                if (v.name && !isNaN(Number(v.price))) {
                    if (isPhysical) {
                        var vIsUnlimited = Boolean(v.isUnlimited);
                        var vStockCount = vIsUnlimited ? 0 : Number(v.stockCount ?? 0) || 0;
                        var variationInsert = await db.query(
                            "INSERT INTO product_variations (product_id, name, price, stock_count, is_unlimited) VALUES ($1, $2, $3, $4, $5) RETURNING id",
                            [productId, v.name, Number(v.price), vStockCount, vIsUnlimited]
                        );
                        if (!vIsUnlimited && vStockCount > 0) {
                            await logStockMovement(db, {
                                productId, variationId: variationInsert.rows[0].id, productName: name, variationName: v.name,
                                change: vStockCount, reason: "manual_adjustment", staffEmail,
                                note: "Variação recriada na edição do produto — valor não reflete um delta real",
                            });
                        }
                    } else {
                        await db.query(
                            "INSERT INTO product_variations (product_id, name, price) VALUES ($1, $2, $3)",
                            [productId, v.name, Number(v.price)]
                        );
                    }
                }
            }
        }

        var existingImagesRaw = formData.get("existingImages");
        var existingImages = existingImagesRaw ? JSON.parse(String(existingImagesRaw)) : [];
        var newImages = formData.getAll("newImages").filter(i => i instanceof File) as File[];
        await db.query("DELETE FROM product_images WHERE product_id = $1", [productId]);

        let currentPosition = 0;
        for (var img of existingImages) {
            await db.query(
                "INSERT INTO product_images (product_id, url, position) VALUES ($1, $2, $3)",
                [productId, img.url, currentPosition++]
            );
        }

        if (newImages.length > 0) {
            const uploadDir = path.join(process.cwd(), "public/uploads/products");
            await mkdir(uploadDir, { recursive: true });

            for (var file of newImages) {
                var ext = path.extname(file.name) || ".jpg";
                var fileName = `${crypto.randomUUID()}${ext}`;
                var filePath = path.join(uploadDir, fileName);
                
                var buffer = Buffer.from(await file.arrayBuffer());
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