"use server";

<<<<<<< ours
import { NextResponse } from "next/server";
import { getDB } from "@/lib/database/db";
=======
import { getDB } from "@/lib/database/db";
import { fail, ok } from "@/lib/api/response";
>>>>>>> theirs

export async function GET() {
  try {
    const db = getDB();
    const result = await db.query("SELECT id, email FROM admin ORDER BY email ASC");
<<<<<<< ours
    return NextResponse.json({ admins: result.rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
=======
    return ok(result.rows);
  } catch (error) {
    console.error(error);
    return fail("INTERNAL_ERROR", 500);
>>>>>>> theirs
  }
}
