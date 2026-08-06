import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, parseDate, parseMoney, serverError, unauthorized } from "@/lib/api";
import { createPalletWithCode } from "@/lib/skus";
import { CATEGORIES, CONDITION_GRADES } from "@/lib/constants";
import { logActivity } from "@/lib/activity";
import { parseCount } from "@/lib/parse";

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
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

    const fees = parseMoney(b.fees) ?? 0;
    if (fees > totalCost) {
      return badRequest("Fees cannot exceed the total cost — total cost is the all-in figure");
    }

    const pallet = await createPalletWithCode({
        supplier,
        sourceLotId: typeof b.sourceLotId === "string" && b.sourceLotId.trim() ? b.sourceLotId.trim() : null,
        purchaseDate,
        totalCost,
        fees,
        manifestUrl: typeof b.manifestUrl === "string" && b.manifestUrl.trim() ? b.manifestUrl.trim() : null,
        category,
        conditionGrade: CONDITION_GRADES.includes(b.conditionGrade) ? b.conditionGrade : "MIXED",
        manifestUnitCount: parseCount(b.manifestUnitCount),
        actualUnitCount: parseCount(b.actualUnitCount),
        manifestRetailTotal: parseMoney(b.manifestRetailTotal),
        // Recorded before bidding; drives the estimate-accuracy metric. Null is
        // allowed so an existing workflow is not blocked, but the lot then sits
        // outside metric 5 entirely — the form says so.
        preBidEstimatedRecovery: parseMoney(b.preBidEstimatedRecovery),
        // The clock every timing metric runs from. Falls back to the purchase
        // date rather than leaving the lot invisible to sell-through.
        pickupDate: parseDate(b.pickupDate) ?? purchaseDate,
        notes: typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null,
    });
    logActivity(user.name, "pallet.create", `${pallet.palletCode} — ${supplier}`);
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
