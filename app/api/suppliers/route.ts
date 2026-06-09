import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, parseDate, parseMoney, serverError, unauthorized } from "@/lib/api";

export async function POST(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    if (!b) return badRequest("Invalid JSON body");
    const supplierName = typeof b.supplierName === "string" ? b.supplierName.trim() : "";
    const purchaseDate = parseDate(b.purchaseDate);
    const totalPaid = parseMoney(b.totalPaid);
    const palletsBought = parseInt(String(b.palletsBought), 10);
    if (!supplierName) return badRequest("Supplier name is required");
    if (!purchaseDate) return badRequest("Purchase date is required");
    if (totalPaid === null) return badRequest("Total paid must be a non-negative number");
    const purchase = await prisma.supplierPurchase.create({
      data: {
        supplierName,
        purchaseDate,
        totalPaid,
        palletsBought: Number.isFinite(palletsBought) && palletsBought > 0 ? palletsBought : 1,
        manifestId: typeof b.manifestId === "string" && b.manifestId.trim() ? b.manifestId.trim() : null,
        category: typeof b.category === "string" && b.category.trim() ? b.category.trim() : null,
        notes: typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null,
      },
    });
    return NextResponse.json({ id: purchase.id });
  } catch (e) {
    return serverError(e);
  }
}
