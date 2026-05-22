import { jwtVerify } from "jose";

export async function requirePermission(
  req: Request,
  permission: string
) {
  const token = req.headers.get("auth_token")?.replace("Bearer ", "");

  if (!token) {
    throw new Error("UNAUTHORIZED");
  }

  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const { payload } = await jwtVerify(token, secret);

  const permissions = payload.permissions as string[];

  if (!permissions?.includes(permission)) {
    throw new Error("FORBIDDEN");
  }

  return payload;
}