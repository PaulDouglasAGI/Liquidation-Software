import "server-only";
import { prisma } from "./db";
import { num } from "./serialize";
import { getSettingNum, getFeeRates } from "./settings";
import {
  velocity,
  velocityByBrand,
  velocityByCategory,
  monthlyTrend,
  repriceSuggestions,
  returnRate,
} from "./insightsMath";

// Types and the arithmetic itself live in ./insightsMath (pure + unit-tested);
// this module only fetches rows and flattens Prisma Decimals into numbers.
export type { VelocityRow, RepriceSuggestion, MonthRow, SoldRow, ListedRow } from "./insightsMath";

export async function computeInsights() {
  const agingDays = await getSettingNum("agingDays");
  const feeRates = await getFeeRates();
  const [soldRaw, listedRaw, returnedCount] = await Promise.all([
    prisma.item.findMany({
      where: { status: "SOLD" },
      select: { category: true, brand: true, dateListed: true, dateSold: true, soldPrice: true, msrp: true, ourCost: true, feesAmount: true, shippingCost: true },
    }),
    prisma.item.findMany({
      where: { status: "LISTED" },
      select: { id: true, sku: true, name: true, dateListed: true, sellPrice: true, ourCost: true, platform: true },
    }),
    // Counted by history, not by current status. A return that has been put
    // back on the shelf is still a return; counting only units sitting in
    // RETURNED meant the rate fell back to zero as soon as anyone dealt with
    // them, which is exactly when it stops being visible and starts mattering.
    prisma.item.count({ where: { dateReturned: { not: null } } }),
  ]);

  const sold = soldRaw.map((i) => ({
    category: i.category as string,
    brand: i.brand,
    dateListed: i.dateListed,
    dateSold: i.dateSold,
    soldPrice: num(i.soldPrice),
    msrp: num(i.msrp),
    ourCost: i.ourCost.toNumber(),
    feesAndShip: (num(i.feesAmount) ?? 0) + (num(i.shippingCost) ?? 0),
  }));

  const listed = listedRaw.map((i) => ({
    id: i.id,
    sku: i.sku,
    name: i.name,
    dateListed: i.dateListed,
    sellPrice: num(i.sellPrice),
    ourCost: i.ourCost.toNumber(),
    platform: i.platform as string | null,
  }));

  return {
    overall: velocity("All sales", sold),
    byCategory: velocityByCategory(sold),
    byBrand: velocityByBrand(sold),
    months: monthlyTrend(sold),
    suggestions: repriceSuggestions(listed, agingDays, feeRates),
    returnRate: returnRate(sold.length, returnedCount),
    agingDays,
  };
}
