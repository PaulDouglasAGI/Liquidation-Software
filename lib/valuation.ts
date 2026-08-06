import "server-only";
import { prisma } from "./db";
import { num } from "./serialize";
import { getFeeRates } from "./settings";
import { velocityByBrand, velocityByCategory } from "./insightsMath";
import { valueInventory, type InventoryValuation } from "./valuationMath";
import { ON_HAND_STATUSES } from "./countMath";

/**
 * Values everything unsold, using this business's own recovery history.
 *
 * Reads live so the dashboard cannot show a stale number; both queries are
 * indexed on status and the maths is O(n) over held stock.
 */
export async function valueCurrentInventory(): Promise<InventoryValuation> {
  const [heldRaw, soldRaw, feeRates] = await Promise.all([
    prisma.item.findMany({
      where: { status: { in: ON_HAND_STATUSES as never } },
      select: {
        category: true, brand: true, status: true,
        ourCost: true, sellPrice: true, msrp: true, platform: true,
      },
    }),
    // Same source the Insights page and Bid Calculator use, so every screen
    // agrees on what a category actually recovers.
    prisma.item.findMany({
      where: { status: "SOLD" },
      select: {
        category: true, brand: true, dateListed: true, dateSold: true,
        soldPrice: true, msrp: true, ourCost: true,
      },
    }),
    getFeeRates(),
  ]);

  const sold = soldRaw.map((i) => ({
    category: i.category as string,
    brand: i.brand,
    dateListed: i.dateListed,
    dateSold: i.dateSold,
    soldPrice: num(i.soldPrice),
    msrp: num(i.msrp),
    ourCost: i.ourCost.toNumber(),
    feesAndShip: 0, // unused by the velocity maths
  }));

  return valueInventory(
    heldRaw.map((i) => ({
      category: i.category as string,
      brand: i.brand,
      status: i.status as string,
      ourCost: i.ourCost.toNumber(),
      sellPrice: num(i.sellPrice),
      msrp: num(i.msrp),
      platform: i.platform as string | null,
    })),
    { byCategory: velocityByCategory(sold), byBrand: velocityByBrand(sold, 2, 50) },
    feeRates
  );
}
