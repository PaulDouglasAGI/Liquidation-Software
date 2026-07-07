import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, unauthorized } from "@/lib/api";

/**
 * Resolve a scanned code (SKU label or product UPC) to an item.
 * One match -> { match: "item", id }; several -> { match: "many", q };
 * nothing -> { match: "none" }.
 */
export async function GET(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  const raw = (req.nextUrl.searchParams.get("code") ?? "").trim();
  if (!raw) return badRequest("code required");

  // SKU labels are Code 128 of the exact SKU
  const bySku = await prisma.item.findFirst({
    where: { sku: { equals: raw, mode: "insensitive" } },
    select: { id: true },
  });
  if (bySku) return NextResponse.json({ match: "item", id: bySku.id });

  // Product barcodes: match on digits
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) {
    const byUpc = await prisma.item.findMany({
      where: { upc: digits },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: 2,
    });
    if (byUpc.length === 1) return NextResponse.json({ match: "item", id: byUpc[0].id });
    if (byUpc.length > 1) return NextResponse.json({ match: "many", q: digits });
  }

  return NextResponse.json({ match: "none", q: raw });
}
