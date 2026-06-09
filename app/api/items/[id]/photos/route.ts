import { NextRequest, NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, serverError, unauthorized } from "@/lib/api";
import { resolveUploadPath, uploadRoot } from "@/lib/uploads";

type Params = { params: Promise<{ id: string }> };

const MAX_PHOTOS = 8;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await apiUser())) return unauthorized();
  try {
    const { id } = await params;
    const item = await prisma.item.findUnique({ where: { id }, select: { photos: true } });
    if (!item) return notFound("Item not found");

    const form = await req.formData();
    const files = form.getAll("photos").filter((f): f is File => f instanceof File);
    if (files.length === 0) return badRequest("No photos in request");
    if (item.photos.length + files.length > MAX_PHOTOS) {
      return badRequest(`Max ${MAX_PHOTOS} photos per item (${item.photos.length} already uploaded)`);
    }

    const dir = path.join(uploadRoot(), "items", id);
    await mkdir(dir, { recursive: true });

    const added: string[] = [];
    for (const file of files) {
      if (!ALLOWED.has(file.type)) return badRequest(`Unsupported file type: ${file.type}`);
      if (file.size > MAX_BYTES) return badRequest(`File too large (max ${MAX_BYTES / 1024 / 1024}MB)`);
      const name = randomBytes(8).toString("hex") + (EXT[file.type] ?? ".jpg");
      await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
      added.push(`items/${id}/${name}`);
    }

    const updated = await prisma.item.update({
      where: { id },
      data: { photos: { push: added } },
      select: { photos: true },
    });
    return NextResponse.json({ photos: updated.photos });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await apiUser())) return unauthorized();
  try {
    const { id } = await params;
    const photo = req.nextUrl.searchParams.get("photo");
    if (!photo) return badRequest("photo query param required");
    const item = await prisma.item.findUnique({ where: { id }, select: { photos: true } });
    if (!item) return notFound("Item not found");
    if (!item.photos.includes(photo)) return notFound("Photo not on this item");

    const full = resolveUploadPath(photo);
    if (full) await unlink(full).catch(() => {});
    const updated = await prisma.item.update({
      where: { id },
      data: { photos: item.photos.filter((p) => p !== photo) },
      select: { photos: true },
    });
    return NextResponse.json({ photos: updated.photos });
  } catch (e) {
    return serverError(e);
  }
}
