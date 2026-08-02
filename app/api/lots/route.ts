import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, parseMoney, serverError, unauthorized } from "@/lib/api";
import { formatCode, maxSuffix } from "@/lib/skuFormat";
import { isUniqueViolation } from "@/lib/skus";
import { priceLot, type LotCandidate } from "@/lib/lotMath";
import { feeRateFor } from "@/lib/fees";
import { getFeeRates } from "@/lib/settings";
import { logActivity } from "@/lib/activity";

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

    const items = await prisma.item.findMany({ where: { id: { in: itemIds } } });
    if (items.length === 0) return badRequest("Items not found");
    const alreadyLotted = items.filter((i) => i.lotId);
    if (alreadyLotted.length) return badRequest(`${alreadyLotted.length} item(s) are already in a lot`);
    const sold = items.filter((i) => i.status === "SOLD");
    if (sold.length) return badRequest(`${sold.length} item(s) are already sold`);

    const rates = await getFeeRates();
    const platform = typeof b.platform === "string" ? b.platform : "EBAY";
    const candidates: LotCandidate[] = items.map((i) => ({
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
          const existing = await tx.lot.findMany({
            where: { lotCode: { startsWith: prefix } },
            select: { lotCode: true },
          });
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
          return created;
        }, { timeout: 20_000 });

        logActivity(user.name, "lot.create", `${lot.lotCode}: ${items.length} item(s) at ${askingPrice}`);
        return NextResponse.json({ id: lot.id, lotCode: lot.lotCode, pricing, askingPrice });
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 3) continue;
        throw e;
      }
    }
  } catch (e) {
    return serverError(e);
  }
}
