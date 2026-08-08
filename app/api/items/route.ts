import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, parseMoney, serverError, unauthorized } from "@/lib/api";
import { createItemsWithSkus } from "@/lib/skus";
import { normalizeBrand } from "@/lib/parse";
import { recalcPalletStatus, spreadPalletCost } from "@/lib/pallets";
import { getSettingNum } from "@/lib/settings";
import { CATEGORIES, CONDITIONS } from "@/lib/constants";
import { logActivity } from "@/lib/activity";

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    if (!b) return badRequest("Invalid JSON body");

    const palletId = typeof b.palletId === "string" ? b.palletId : "";
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!palletId) return badRequest("palletId is required");
    if (!name) return badRequest("Product name is required");

    const pallet = await prisma.pallet.findUnique({
      where: { id: palletId },
      include: { _count: { select: { items: true } } },
    });
    if (!pallet) return notFound("Pallet not found");

    const msrp = parseMoney(b.msrp);

    // "Save ×N" for identical units — creates N individual items in one go.
    const qtyRaw = parseInt(String(b.qty ?? "1"), 10);
    const qty = Number.isFinite(qtyRaw) ? Math.min(Math.max(qtyRaw, 1), 50) : 1;

    // Default cost: even spread of the pallet cost. Snapshotting at creation
    // time drifts badly (the first scanned item would carry the whole pallet
    // cost), so when the cost is auto-derived we re-spread across the pallet's
    // unsold items after creating — same behavior as manifest import.
    const explicitCost = parseMoney(b.ourCost);
    const ourCost =
      explicitCost ?? Math.round((pallet.totalCost.toNumber() / (pallet._count.items + qty)) * 100) / 100;

    // Default sell price: configured % of MSRP.
    let sellPrice = parseMoney(b.sellPrice);
    if (sellPrice === null && msrp !== null) {
      const pctOfMsrp = await getSettingNum("defaultPricePct");
      sellPrice = Math.round(msrp * pctOfMsrp) / 100;
    }

    const data = {
        upc: typeof b.upc === "string" && b.upc.trim() ? b.upc.replace(/\D/g, "") : null,
        name,
        brand: normalizeBrand(b.brand),
        category: CATEGORIES.includes(b.category) ? b.category : pallet.category,
        condition: CONDITIONS.includes(b.condition) ? b.condition : "GOOD",
        conditionNotes: typeof b.conditionNotes === "string" && b.conditionNotes.trim() ? b.conditionNotes.trim() : null,
        msrp,
        ourCost,
        sellPrice,
        serialNumber: typeof b.serialNumber === "string" && b.serialNumber.trim() ? b.serialNumber.trim() : null,
        weightLbs: parseMoney(b.weightLbs),
        lengthIn: parseMoney(b.lengthIn),
        widthIn: parseMoney(b.widthIn),
        heightIn: parseMoney(b.heightIn),
        storageLocation: typeof b.storageLocation === "string" && b.storageLocation.trim() ? b.storageLocation.trim() : null,
        notes: typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null,
    };

    const first = await createItemsWithSkus(palletId, data, qty);

    if (explicitCost === null) {
      // Same rule as manifest import: everything not yet SOLD takes a share.
      // Re-spreading only IN_STOCK here meant intake and import allocated the
      // same pallet cost differently, so which screen you added a unit on
      // changed the COGS on units you added yesterday.
      await spreadPalletCost(palletId);
    }
    await recalcPalletStatus(palletId);
    logActivity(user.name, "item.create", qty > 1 ? `${first.sku} ×${qty} — ${name}` : `${first.sku} — ${name}`);
    return NextResponse.json({ id: first.id, sku: first.sku, sellPrice, count: qty });
  } catch (e) {
    return serverError(e);
  }
}
