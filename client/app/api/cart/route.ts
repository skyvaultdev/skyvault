import { NextRequest } from "next/server";
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
import { verifyJWT } from "@/lib/jwt/init";
import { cookies } from "next/headers";


export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) {
      return fail("UNAUTHORIZED_TOKEN", 401);
    }

    const decoded = await verifyJWT(token);
    if (!decoded || !decoded.email) {
      return fail("UNAUTHORIZED_TOKEN", 401);
    }

    const userEmail = decoded.email;
    const db = getDB();

    const { rows: discUser } = await db.query(`SELECT id FROM discuser WHERE email = $1`, [userEmail]);
    const { rows: regularUser } = await db.query(`SELECT id FROM users WHERE email = $1`, [userEmail]);

    if (discUser.length === 0 && regularUser.length === 0) {
      return fail("UNAUTHORIZED_TOKEN", 401);
    }

    const userId = discUser.length > 0 ? discUser[0].id : regularUser[0].id;
    const result = await db.query(`
      SELECT 
          c.id AS cart_item_id,
          p.name AS product_name,
          p.slug,
          COALESCE(v.name, 'Padrão') AS variation_name,
          COALESCE(v.price, p.price) AS unit_price,
          c.quantity,
          COALESCE(v.stock_count, p.stock_count) AS stock_count,
          COALESCE(v.is_unlimited, p.is_unlimited) AS is_unlimited,
          (
            SELECT url FROM product_images 
            WHERE product_id = p.id 
            ORDER BY position ASC LIMIT 1
          ) AS image_url
      FROM cart_items c
      JOIN products p ON c.product_id = p.id
      LEFT JOIN product_variations v ON c.variation_id = v.id
      WHERE c.user_id = $1
      ORDER BY c.added_at DESC;
    `, [userId]);

    return ok(result.rows);
  } catch (error) {
    console.error("Erro no GET Cart:", error);
    return fail("INTERNAL_SERVER_ERROR", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;

    if (!token) return fail("UNAUTHORIZED_TOKEN", 401);
    const decoded = await verifyJWT(token);
    if (!decoded || !decoded.email) return fail("UNAUTHORIZED_TOKEN", 401);

    const userEmail = decoded.email;

    const db = getDB();
    const { rows: discUser } = await db.query(`SELECT id FROM discuser WHERE email = $1`, [userEmail]);
    const { rows: regularUser } = await db.query(`SELECT id FROM users WHERE email = $1`, [userEmail]);

    let userId: number | string;
    if (discUser.length > 0) userId = discUser[0].id;
    else if (regularUser.length > 0) userId = regularUser[0].id;
    else return fail("USER_NOT_FOUND", 404);

    const body = await req.json();
    const product_id = Number(body.product_id);
    const variation_id = body.variation_id ? Number(body.variation_id) : null;
    const quantityToAdd = Number(body.quantity ?? 1);

    if (!product_id || quantityToAdd <= 0) return fail("INVALID_DATA", 400);
    const stockCheckQuery = variation_id
      ? `SELECT stock_count, is_unlimited FROM product_variations WHERE id = $1 AND product_id = $2`
      : `SELECT stock_count, is_unlimited FROM products WHERE id = $1`;

    const stockParams = variation_id ? [variation_id, product_id] : [product_id];
    const { rows: stockData } = await db.query(stockCheckQuery, stockParams);

    if (stockData.length === 0) return fail("PRODUCT_NOT_FOUND", 404);

    const item = stockData[0];
    if (!item.is_unlimited && item.stock_count < quantityToAdd) {
      return fail("OUT_OF_STOCK", 400);
    }


    let result;
    if (variation_id === null) {
      const upsertNoVar = `
        INSERT INTO cart_items (user_id, product_id, variation_id, quantity)
        VALUES ($1, $2, NULL, $3)
        ON CONFLICT (user_id, product_id) WHERE variation_id IS NULL
        DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
        RETURNING *;`;
      result = await db.query(upsertNoVar, [userId, product_id, quantityToAdd]);
    } else {
      const upsertWithVar = `
        INSERT INTO cart_items (user_id, product_id, variation_id, quantity)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, product_id, variation_id) WHERE variation_id IS NOT NULL
        DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
        RETURNING *;`;
      result = await db.query(upsertWithVar, [userId, product_id, variation_id, quantityToAdd]);
    }

    return ok(result.rows[0]);
  } catch (error) {
    console.error("Erro no PUT Cart:", error);
    return fail("INTERNAL_SERVER_ERROR", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;

    if (!token) return fail("UNAUTHORIZED_TOKEN", 401);
    const decoded = await verifyJWT(token);
    if (!decoded || !decoded.email) return fail("UNAUTHORIZED_TOKEN", 401);

    const userEmail = decoded.email;
    const db = getDB();
    const { rows: discUser } = await db.query(`SELECT id FROM discuser WHERE email = $1`, [userEmail]);
    const { rows: regularUser } = await db.query(`SELECT id FROM users WHERE email = $1`, [userEmail]);

    let userId: number | string;
    if (discUser.length > 0) userId = discUser[0].id;
    else if (regularUser.length > 0) userId = regularUser[0].id;
    else return fail("USER_NOT_FOUND", 404);

    const { cart_item_id, quantity } = await req.json();
    if (!cart_item_id) return fail("MISSING_ITEM_ID", 400);

    if (quantity <= 0) {
      await db.query("DELETE FROM cart_items WHERE id = $1 AND user_id = $2", [cart_item_id, userId]);
      return ok({ message: "Item removed" });
    }

    const validateStock = await db.query(`
      SELECT p.stock_count as p_stock, p.is_unlimited as p_unlim, 
             v.stock_count as v_stock, v.is_unlimited as v_unlim,
             c.variation_id
      FROM cart_items c
      JOIN products p ON c.product_id = p.id
      LEFT JOIN product_variations v ON c.variation_id = v.id
      WHERE c.id = $1 AND c.user_id = $2
    `, [cart_item_id, userId]);

    if (validateStock.rowCount === 0) return fail("ITEM_NOT_FOUND", 404);

    const info = validateStock.rows[0];
    const isUnlimited = info.variation_id ? info.v_unlim : info.p_unlim;
    const stockCount = info.variation_id ? info.v_stock : info.p_stock;

    if (!isUnlimited && stockCount < quantity) {
      return fail("INSUFFICIENT_STOCK", 400);
    }

    const result = await db.query(
      "UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *",
      [quantity, cart_item_id, userId]
    );

    return ok(result.rows[0]);
  } catch (error) {
    console.error("Erro no POST Cart Update:", error);
    return fail("INTERNAL_SERVER_ERROR", 500);
  }
}