import "server-only";
import { prisma } from "./db";
import { num } from "./serialize";
import { getSettingNum, getFeeRates } from "./settings";
import { feeAwareFloor, feeRateFor } from "./fees";

export interface VelocityRow {
  key: string;
  soldCount: number;
  avgDaysToSell: number | null;
  avgRecoveryPct: number | null; // sold price as % of MSRP
  avgMultiple: number | null; // sold price / our cost
}

export interface RepriceSuggestion {
  id: string;
  sku: string;
  name: string;
  daysListed: number;
  currentPrice: number;
  suggestedPrice: number;
  cutPct: number;
  costFloor: number; // fee-aware: selling here still nets the cost back
}

export interface MonthRow {
  month: string;
  itemsSold: number;
  revenue: number;
  cogs: number;
  profit: number;
}

const dayMs = 86_400_000;

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function velocity(
  key: string,
  items: { dateListed: Date | null; dateSold: Date | null; soldPrice: number | null; msrp: number | null; ourCost: number }[]
): VelocityRow {
  const days = items
    .filter((i) => i.dateListed && i.dateSold)
    .map((i) => Math.max(0, (i.dateSold!.getTime() - i.dateListed!.getTime()) / dayMs));
  const recovery = items
    .filter((i) => i.soldPrice && i.msrp)
    .map((i) => (i.soldPrice! / i.msrp!) * 100);
  const multiples = items
    .filter((i) => i.soldPrice && i.ourCost > 0)
    .map((i) => i.soldPrice! / i.ourCost);
  return {
    key,
    soldCount: items.length,
    avgDaysToSell: avg(days),
    avgRecoveryPct: avg(recovery),
    avgMultiple: avg(multiples),
  };
}

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
    prisma.item.count({ where: { status: "RETURNED" } }),
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

  // Velocity: overall, by category, by top brands (5+ sales)
  const overall = velocity("All sales", sold);
  const byCategory = [...new Set(sold.map((i) => i.category))]
    .map((c) => velocity(c, sold.filter((i) => i.category === c)))
    .sort((a, b) => b.soldCount - a.soldCount);
  const brandCounts = new Map<string, number>();
  for (const i of sold) if (i.brand) brandCounts.set(i.brand, (brandCounts.get(i.brand) ?? 0) + 1);
  const byBrand = [...brandCounts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([brand]) => velocity(brand, sold.filter((i) => i.brand === brand)))
    .sort((a, b) => b.soldCount - a.soldCount)
    .slice(0, 10);

  // Monthly trend, last 6 months (local time)
  const months: MonthRow[] = [];
  const now = new Date();
  for (let m = 5; m >= 0; m--) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const inMonth = sold.filter((i) => i.dateSold && i.dateSold >= start && i.dateSold < end);
    const revenue = inMonth.reduce((a, i) => a + (i.soldPrice ?? 0), 0);
    // COGS here includes fees + shipping so "profit" is net of everything
    const cogs = inMonth.reduce((a, i) => a + i.ourCost + i.feesAndShip, 0);
    months.push({
      month: start.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      itemsSold: inMonth.length,
      revenue,
      cogs,
      profit: revenue - cogs,
    });
  }

  // Repricing suggestions: listed past the aging threshold, cut deeper the
  // longer it sits, but never below cost.
  const suggestions: RepriceSuggestion[] = [];
  for (const i of listedRaw) {
    const price = num(i.sellPrice);
    if (!i.dateListed || !price) continue;
    const daysListed = Math.floor((Date.now() - i.dateListed.getTime()) / dayMs);
    if (daysListed < agingDays) continue;
    const cutPct = daysListed >= agingDays * 2 ? 20 : 10;
    const cost = i.ourCost.toNumber();
    // Floor is fee-aware: selling at the floor must still NET the cost back
    // after the platform's cut (assume eBay when the listing has no platform).
    const floor = feeAwareFloor(cost, feeRateFor(i.platform ?? "EBAY", feeRates));
    const suggested = Math.max(floor, Math.round(price * (100 - cutPct)) / 100);
    if (suggested >= price) continue; // already at/below cost floor
    suggestions.push({
      id: i.id,
      sku: i.sku,
      name: i.name,
      daysListed,
      currentPrice: price,
      suggestedPrice: suggested,
      cutPct,
      costFloor: floor,
    });
  }
  suggestions.sort((a, b) => b.daysListed - a.daysListed);

  const returnRate =
    sold.length + returnedCount > 0 ? (returnedCount / (sold.length + returnedCount)) * 100 : null;

  return { overall, byCategory, byBrand, months, suggestions, returnRate, agingDays };
}
