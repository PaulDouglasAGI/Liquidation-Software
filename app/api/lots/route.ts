import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, parseMoney, serverError, unauthorized } from "@/lib/api";
import { formatCode, maxSuffix } from "@/lib/skuFormat";
import { lockCounter } from "@/lib/skus";
import { isUniqueViolation } from "@/lib/skus";
import { priceLot, type LotCandidate } from "@/lib/lotMath";
import { feeRateFor } from "@/lib/fees";
import { getFeeRates } from "@/lib/settings";
import { recalcPalletStatus } from "@/lib/pallets";
import { logActivity } from "@/lib/activity";

/** Thrown inside the transaction to abort with a 400 rather than a 500. */
class LotConflict extends Error {}

/** GET /api/lots — every bundle, newest first. */
export async function GET() {
  if (!(await apiUser())) return unauthorized();
  try {
    const lots = await prisma.lot.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { items: true } } },
      take: 200,
    });
    return NextResponse.json({ lots });
  } catch (e) {
    return serverError(e);
  }
}

/**
 * POST /api/lots — bundle slow movers into one listing.
 * { itemIds, name?, askingPrice?, platform?, discountPct? }
 *
 * Items move to RESERVED: they're off the market individually but not sold,
 * so nobody can list or sell one out from under the lot.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const itemIds: string[] = Array.isArray(b?.itemIds) ? b.itemIds.filter((x: unknown) => typeof x === "string") : [];
    if (itemIds.length < 2) return badRequest("A lot needs at least 2 items");

    const preview = await prisma.item.findMany({ where: { id: { in: itemIds } } });
    if (preview.length === 0) return badRequest("Items not found");

    const rates = await getFeeRates();
    const platform = typeof b.platform === "string" ? b.platform : "EBAY";
    const candidates: LotCandidate[] = preview.map((i) => ({
      id: i.id, sku: i.sku, name: i.name,
      ourCost: i.ourCost.toNumber(),
      sellPrice: i.sellPrice?.toNumber() ?? null,
      daysListed: null,
      category: i.category as string,
    }));
    const pricing = priceLot(candidates, feeRateFor(platform, rates), b.discountPct);
    const askingPrice = parseMoney(b.askingPrice) ?? pricing.suggestedPrice;

    const prefix = `LOT-${new Date().getFullYear()}-`;
    for (let attempt = 0; ; attempt++) {
      try {
        const lot = await prisma.$transaction(async (tx) => {
          // Serialise the bundle-code counter. Read-max-then-write lost half
          // its writes at 8 concurrent creates, each a raw unique-constraint
          // 500 rather than a bundle.
          await lockCounter(tx, "lot-code");
          const existing = await tx.lot.findMany({
            where: { lotCode: { startsWith: prefix } },
            select: { lotCode: true },
          });
          // Re-validate inside the transaction: checking beforehand lets two
          // concurrent creates both pass and silently move items between lots.
          const items = await tx.item.findMany({ where: { id: { in: itemIds } } });
          const alreadyLotted = items.filter((i) => i.lotId);
          if (alreadyLotted.length) {
            throw new LotConflict(`Already in a lot: ${alreadyLotted.map((i) => i.sku).join(", ")}`);
          }
          const unavailable = items.filter((i) => i.status === "SOLD" || i.orderRecordId);
          if (unavailable.length) {
            throw new LotConflict(`Already sold or on an order: ${unavailable.map((i) => i.sku).join(", ")}`);
          }

          const created = await tx.lot.create({
            data: {
              lotCode: formatCode(prefix, maxSuffix(existing.map((l) => l.lotCode), prefix) + 1),
              name: typeof b.name === "string" && b.name.trim() ? b.name.trim() : `Lot of ${items.length}`,
              description: typeof b.description === "string" ? b.description.trim() || null : null,
              askingPrice,
              platform: (platform as never) ?? null,
            },
          });
          await tx.item.updateMany({
            where: { id: { in: items.map((i) => i.id) } },
            data: { lotId: created.id, status: "RESERVED" },
          });
          for (const palletId of new Set(items.map((i) => i.palletId))) {
            await recalcPalletStatus(palletId, tx);
          }
          return created;
        }, { timeout: 20_000 });

        logActivity(user.name, "lot.create", `${lot.lotCode}: ${itemIds.length} item(s) at ${askingPrice}`);
        return NextResponse.json({ id: lot.id, lotCode: lot.lotCode, pricing, askingPrice });
      } catch (e) {
        if (e instanceof LotConflict) return badRequest(e.message);
        if (isUniqueViolation(e) && attempt < 3) continue;
        throw e;
      }
    }
  } catch (e) {
    return serverError(e);
  }
}
