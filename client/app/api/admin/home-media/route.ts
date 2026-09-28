"use server";

import path from "path";
import crypto from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { sniffFile } from "@/lib/files/sniffFile";
import { fail, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/auth/guard";

const TYPES: Record<string, { ext: string; max: number }> = {
  "image/jpeg": { ext: ".jpg", max: 5 * 1024 * 1024 },
  "image/png": { ext: ".png", max: 5 * 1024 * 1024 },
  "image/webp": { ext: ".webp", max: 5 * 1024 * 1024 },
  "image/gif": { ext: ".gif", max: 5 * 1024 * 1024 },
  "video/mp4": { ext: ".mp4", max: 30 * 1024 * 1024 },
  "video/webm": { ext: ".webm", max: 30 * 1024 * 1024 },
};

// Sobe imagem/vídeo de banner da home. A extensão vem do tipo validado, nunca
// do nome enviado pelo cliente.
export async function POST(req: Request) {
  try {
    const { denied } = await requirePermission("store.customize");
    if (denied) return denied;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("FILE_REQUIRED", 400);

    const rule = TYPES[file.type];
    if (!rule) return fail("INVALID_FILE_TYPE", 400);
    if (file.size > rule.max) return fail("FILE_TOO_LARGE", 413);

    const bytes = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffFile(bytes);
    if (!sniffed || sniffed.kind === "pdf" || sniffed.mime !== file.type) return fail("INVALID_FILE_TYPE", 400);

    const dir = path.join(process.cwd(), "public", "uploads", "home");
    await mkdir(dir, { recursive: true });
    const name = `${crypto.randomUUID()}${sniffed.ext}`;
    await writeFile(path.join(dir, name), bytes);

    return ok({ url: `/uploads/home/${name}`, kind: file.type.startsWith("video/") ? "video" : "image" }, 201);
  } catch (error) {
    console.error("Erro ao enviar mídia da home:", error);
    return fail("HOME_MEDIA_ERROR", 500);
  }
}
