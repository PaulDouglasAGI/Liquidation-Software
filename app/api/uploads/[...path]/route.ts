import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { apiUser, notFound, unauthorized } from "@/lib/api";
import { resolveUploadPath } from "@/lib/uploads";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!(await apiUser())) return unauthorized();
  const { path: parts } = await params;
  const rel = parts.join("/");
  const full = resolveUploadPath(rel);
  if (!full) return notFound();
  try {
    const data = await readFile(full);
    const ext = rel.slice(rel.lastIndexOf(".")).toLowerCase();
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return notFound();
  }
}
