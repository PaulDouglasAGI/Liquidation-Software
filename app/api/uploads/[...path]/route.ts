import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { notFound } from "@/lib/api";
import { resolveUploadPath } from "@/lib/uploads";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// Deliberately unauthenticated: eBay and Facebook must be able to fetch photo
// URLs when a listing is pushed. Paths act as capability URLs — they contain
// the item's cuid plus a random hex filename, so they are not guessable.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
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
