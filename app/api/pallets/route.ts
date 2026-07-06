import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, parseDate, parseMoney, serverError, unauthorized } from "@/lib/api";
import { createPalletWithCode } from "@/lib/skus";
import { CATEGORIES } from "@/lib/constants";

export async function POST(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    if (!b) return badRequest("Invalid JSON body");
    const supplier = typeof b.supplier === "string" ? b.supplier.trim() : "";
    const purchaseDate = parseDate(b.purchaseDate);
    const totalCost = parseMoney(b.totalCost);
    if (!supplier) return badRequest("Supplier is required");
    if (!purchaseDate) return badRequest("Purchase date is required");
    if (totalCost === null) return badRequest("Pallet cost must be a non-negative number");
    const category = CATEGORIES.includes(b.category) ? b.category : "MIXED";

    const pallet = await createPalletWithCode({
        supplier,
        purchaseDate,
        totalCost,
        manifestUrl: typeof b.manifestUrl === "string" && b.manifestUrl.trim() ? b.manifestUrl.trim() : null,
        category,
        notes: typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null,
    });
    return NextResponse.json({ id: pallet.id, palletCode: pallet.palletCode });
  } catch (e) {
    return serverError(e);
  }
}

export async function GET() {
  if (!(await apiUser())) return unauthorized();
  const pallets = await prisma.pallet.findMany({
    orderBy: { palletCode: "desc" },
    select: { id: true, palletCode: true, supplier: true, status: true },
  });
  return NextResponse.json(pallets);
}
