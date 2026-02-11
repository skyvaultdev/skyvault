import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT } from "../../../lib/jwt/init";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    return NextResponse.json({ logged: false });
  }

  try {
    const payload = (await verifyJWT(token)) as { email?: string };
    return NextResponse.json({ logged: true, email: payload.email });
  } catch {
    return NextResponse.json({ logged: false });
  }
}
